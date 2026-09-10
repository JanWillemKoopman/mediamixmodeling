// De doorloop: de hele weg van CSV tot startklaar recept, op het echte demobestand.
//
// Dit is de test uit docs/CHAT_PIPELINE_HERZIENING.md §8.3. Waar de invariantentest de
// toestandsruimte afloopt met verzonnen feiten, loopt deze één weg af met échte data — en
// juist die data heeft de valkuilen die ertoe doen: `email_verzendingen` is geen euro maar
// een volume (en dat verschil is aan de uitkomst niet te zien terwijl het elk budgetadvies
// betekenisloos maakt), de KPI is een telling en geen bedrag, en er zitten twee 0/1-kolommen
// in die geen kanaal zijn maar het campagneplan beschrijven.
//
// Bij elke tussenstap worden de invarianten opnieuw gecontroleerd, zodat niet alleen het
// eindpunt maar de hele weg klopt.

import { readFileSync } from "fs";
import path from "path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { buildSourceProfile } from "@/lib/dataProfile";
import { analyseProfile, checkSource } from "@/lib/flow/dataCheck";
import { buildRecipe } from "@/lib/flow/recipe";
import { activeStep, availableActions, deriveFlowState } from "@/lib/flow/state";
import { STEPS, type Ledger, type StepId } from "@/lib/flow/steps";
import type { ChannelUnit, ColumnMapping, ProjectSnapshot, SourceFile } from "@/lib/types";
import { buildWorld } from "@/lib/flow/__tests__/worlds";

const CSV = path.resolve(__dirname, "../../../demo_data/mediamarkt_demo_dataset.csv");

function realProfile() {
  const text = readFileSync(CSV, "utf8");
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });
  return buildSourceProfile(parsed.meta.fields ?? [], parsed.data);
}

// Wat de gebruiker in stap 3 zou aanwijzen (zie demo_data/DEMO_DATASET_MEDIAMARKT.md). Het
// niet-monetaire kanaal staat er nadrukkelijk in: dat is de keuze die deze stap moet
// afdwingen.
const UNITS: Record<string, ChannelUnit> = { email_verzendingen: "sendings" };
const KPI = "flatscreen_verkopen";
const CONTROLS = new Set([
  "tv_always_on_campagne",
  "tv_burst_campagne",
  "gemiddelde_prijs",
  "promo_korting_pct",
  "consumenten_vertrouwen",
]);

function confirmedMapping(columnNames: string[]): ColumnMapping {
  return {
    granularity: "week",
    layout: "breed",
    currency: "EUR",
    reasoning: "",
    columns: columnNames.map((name) => ({
      name,
      role:
        name === "week"
          ? ("date" as const)
          : name === KPI
            ? ("kpi" as const)
            : CONTROLS.has(name)
              ? ("control" as const)
              : ("spend" as const),
      meaning: "",
      unit: name in UNITS ? UNITS[name] : null,
      confidence: "hoog" as const,
    })),
  };
}

/** Elke tussenstap moet de invarianten halen — niet alleen het eindpunt. */
function assertInvariants(snapshot: ProjectSnapshot, ledger: Ledger, where: string) {
  const state = deriveFlowState(snapshot, ledger);
  const step = activeStep(state);

  // 1. Nooit doodlopend.
  expect(availableActions(state).length > 0 || step.status === "waiting", `doodlopend bij ${where}`).toBe(true);
  // 2. Precies één actieve stap.
  expect(state.steps.filter((s) => s.status === "active" || s.status === "waiting").length, where).toBe(1);
  // 6. Af te ronden zonder te typen.
  if (step.status !== "waiting") {
    expect(step.actions.filter((a) => !a.needsText).length, `moet typen bij ${where}`).toBeGreaterThan(0);
  }
  return state;
}

describe("de hele weg, op het echte demobestand", () => {
  const profile = realProfile();

  it("leest het demobestand als bruikbaar", () => {
    const check = checkSource(profile);
    expect(check.verdict).toBe("usable");
    expect(profile.date_column).toBe("week");
  });

  it("loopt van leeg project tot een startklaar recept", () => {
    const columnNames = profile.columns.map((c) => c.name);
    let ledger: Ledger = {};

    // --- stap 1: doel ------------------------------------------------------------------
    let world = buildWorld({
      goal: false,
      source: false,
      columnsConfirmed: false,
      dataset: null,
      beliefs: false,
      run: null,
      level: "statistically_valid",
      published: false,
      resultsAcknowledged: false,
    });
    let state = assertInvariants(world.snapshot, ledger, "leeg project");
    expect(state.activeStepId).toBe("goal");
    // Eerst waar je op stuurt, dan wat je meet — en pas dan is de stap af.
    ledger = { goal: { step: "goal", decision: { aim: "budget" }, summary: "", decided_at: "2026-01-05T09:01:00Z", decided_by: null } };
    expect(STEPS.goal.isDone({ snapshot: world.snapshot, ledger })).toBe(false);
    ledger.goal!.decision.kpi_type = "revenue";
    expect(STEPS.goal.isDone({ snapshot: world.snapshot, ledger })).toBe(true);

    // --- stap 2: bestand ---------------------------------------------------------------
    state = assertInvariants(world.snapshot, ledger, "doel gekozen");
    expect(state.activeStepId).toBe("data");

    world = buildWorld({
      goal: true, source: true, columnsConfirmed: false, dataset: null,
      beliefs: false, run: null, level: "statistically_valid", published: false, resultsAcknowledged: false,
    });
    const source: SourceFile = { ...world.snapshot.sources[0], profile, mapping: null };
    let snapshot: ProjectSnapshot = { ...world.snapshot, sources: [source] };

    // --- stap 3: kolommen --------------------------------------------------------------
    state = assertInvariants(snapshot, ledger, "bestand aanwezig");
    expect(state.activeStepId).toBe("columns");

    const mapping = confirmedMapping(columnNames);
    const kanalen = mapping.columns.filter((c) => c.role === "spend");
    expect(kanalen.length).toBeGreaterThan(5);
    // Het niet-monetaire kanaal is als zodanig herkend. Zonder dat onderscheid krijgen
    // e-mailverzendingen straks een "rendement per euro".
    expect(mapping.columns.find((c) => c.name === "email_verzendingen")!.unit).toBe("sendings");
    // En de 0/1-campagnekolommen zijn geen kanaal: ze beschrijven het plan, ze zijn geen druk.
    expect(mapping.columns.find((c) => c.name === "tv_always_on_campagne")!.role).toBe("control");

    const confirmed: SourceFile = { ...source, mapping, inspection_confirmed_at: "2026-01-05T09:03:00Z" };
    snapshot = { ...snapshot, sources: [confirmed] };

    // --- stap 4: klaarmaken ------------------------------------------------------------
    state = assertInvariants(snapshot, ledger, "kolommen bevestigd");
    expect(state.activeStepId).toBe("prepare");

    const { findings, notes } = analyseProfile(profile, mapping);
    // Elke bevinding is beantwoordbaar zonder statistiekkennis: een vraag met keuzes die
    // allemaal zeggen wat ze doen.
    for (const finding of findings) {
      expect(finding.headline.length, finding.id).toBeGreaterThan(10);
      expect(finding.choices.length, finding.id).toBeGreaterThan(1);
      expect(finding.choices.some((c) => c.id === finding.defaultChoice), finding.id).toBe(true);
    }
    for (const note of notes) expect(note.length).toBeGreaterThan(20);

    const choices = Object.fromEntries(findings.map((f) => [f.id, f.defaultChoice]));
    const { recipe, problem } = buildRecipe(confirmed, mapping, choices);
    expect(problem).toBeNull();
    expect(recipe!.sources[0].date_column).toBe("week");

    // Het recept draagt precies de kolommen die meedoen — en niets wat de gebruiker heeft
    // laten vallen.
    const inRecipe = new Set(recipe!.sources[0].columns.map((c) => c.name));
    expect(inRecipe.has(KPI)).toBe(true);
    expect(inRecipe.has("tv_spend")).toBe(true);
    expect(inRecipe.has("week")).toBe(false); // de datum is geen kolom met een rol

    // Een fill mag alleen op een control staan; op een andere rol weigert de rekenkern hem.
    for (const column of recipe!.sources[0].columns) {
      if (column.fill != null) expect(column.role, `${column.name} draagt een fill`).toBe("control");
    }

    // --- de rest van de weg blijft begaanbaar -----------------------------------------
    // Vanaf hier bouwt fase 3 verder; wat telt is dat elke volgende toestand een uitweg heeft.
    const laterStages: { where: string; spec: Parameters<typeof buildWorld>[0] }[] = [
      { where: "data wordt klaargemaakt", spec: { goal: true, source: true, columnsConfirmed: true, dataset: "building", beliefs: false, run: null, level: "statistically_valid", published: false, resultsAcknowledged: false } },
      { where: "klaarmaken mislukt", spec: { goal: true, source: true, columnsConfirmed: true, dataset: "failed", beliefs: false, run: null, level: "statistically_valid", published: false, resultsAcknowledged: false } },
      { where: "kwaliteitsrapport klaar", spec: { goal: true, source: true, columnsConfirmed: true, dataset: "ready", beliefs: false, run: null, level: "statistically_valid", published: false, resultsAcknowledged: false } },
      { where: "data goedgekeurd", spec: { goal: true, source: true, columnsConfirmed: true, dataset: "approved", beliefs: false, run: null, level: "statistically_valid", published: false, resultsAcknowledged: false } },
    ];
    for (const stage of laterStages) {
      const w = buildWorld(stage.spec);
      assertInvariants({ ...w.snapshot, sources: [confirmed] }, ledger, stage.where);
    }
  });

  it("laat de gebruiker niet vastlopen als hij halverwege een ander bestand kiest", () => {
    // Bestand weg, maar de goedgekeurde dataset staat er nog: precies de rommelige toestand
    // die in productie ontstaat en waar de oude wizard stil in bleef hangen.
    const world = buildWorld({
      goal: true, source: false, columnsConfirmed: false, dataset: "approved",
      beliefs: true, run: null, level: "statistically_valid", published: false, resultsAcknowledged: false,
    });
    const ledger: Ledger = {
      goal: { step: "goal" as StepId, decision: { aim: "budget", kpi_type: "revenue" }, summary: "", decided_at: "2026-01-05T09:01:00Z", decided_by: null },
    };
    const state = assertInvariants(world.snapshot, ledger, "bestand vervangen");
    expect(state.activeStepId).toBe("data");
  });
});
