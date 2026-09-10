// Een bevestigde stap mag niet achterhaald blijven door een stap die ervóór komt.
//
// Dit is de toestand waarin een demo-project terechtkwam. Het bestand wordt bij het aanmaken
// al klaargezet, dus stap 2 heeft een tijdstip dat vóór de doelkeuze uit stap 1 ligt. De
// veroudering las alleen dat feit en concludeerde: stap 2 is achterhaald door stap 1. Stap 2
// werd daarmee de actieve stap, "Verder met dit bestand" legde niets vast, en de volgende
// afleiding kwam tot exact dezelfde conclusie. De gebruiker kon oneindig klikken zonder ooit
// bij stap 3 te komen — zonder foutmelding, want er ging technisch niets mis.
//
// De wereldenset in worlds.ts kon dit niet vinden: die zet elke stap op een oplopende klok en
// gaat er dus vanuit dat het bestand ná het doel komt. Deze test draait die volgorde om.

import { describe, expect, it } from "vitest";
import { deriveFlowState } from "@/lib/flow/state";
import { buildWorld, type WorldSpec } from "@/lib/flow/__tests__/worlds";
import type { Ledger, StepId } from "@/lib/flow/steps";

const BASIS: WorldSpec = {
  goal: true,
  source: true,
  columnsConfirmed: false,
  dataset: null,
  beliefs: false,
  run: null,
  level: "statistically_valid",
  published: false,
  resultsAcknowledged: false,
};

/** Een project zoals de demo het aanmaakt: het bestand bestaat al vóór de doelkeuze. */
function demoVolgorde(spec: WorldSpec = BASIS) {
  const { snapshot, ledger } = buildWorld(spec);
  const bestandOp = "2026-01-05T09:00:00.000Z";
  const doelOp = "2026-01-05T09:05:00.000Z";
  snapshot.sources[0] = { ...snapshot.sources[0], created_at: bestandOp };
  // Een écht afgerond doel: stap 1 is pas af als beide vragen beantwoord zijn, dus de
  // beslissing moet ook een kpi_type dragen.
  ledger.goal = {
    step: "goal",
    decision: { aim: "effect", kpi_type: "orders" },
    summary: "Doel: aantonen wat de kanalen opleveren · aantal bestellingen",
    decided_at: doelOp,
    decided_by: null,
  };
  return { snapshot, ledger, bestandOp, doelOp };
}

/** Wat "Verder met dit bestand" nu vastlegt: een bevestiging op het moment van klikken. */
function bevestig(ledger: Ledger, step: StepId, op: string): Ledger {
  return { ...ledger, [step]: { step, decision: {}, summary: "Bestand: verkoop.csv", decided_at: op } };
}

describe("de demo-volgorde: bestand ouder dan doelkeuze", () => {
  it("zet de gebruiker bij stap 2, want die is nog niet bevestigd", () => {
    const { snapshot, ledger } = demoVolgorde();
    expect(deriveFlowState(snapshot, ledger).activeStepId).toBe("data");
  });

  it("laat de gebruiker door zodra hij het bestand bevestigt", () => {
    const { snapshot, ledger } = demoVolgorde();
    const state = deriveFlowState(snapshot, bevestig(ledger, "data", "2026-01-05T09:10:00.000Z"));

    expect(state.activeStepId).toBe("columns");
    const data = state.steps.find((s) => s.id === "data")!;
    expect(data.status).toBe("done");
  });

  it("blijft hangen zonder die bevestiging — precies de bug die dit repareert", () => {
    const { snapshot, ledger } = demoVolgorde();
    // Twee keer afleiden zonder dat er iets is vastgelegd: de tweede keer verandert er niets.
    // Zó zag elke klik op "Verder met dit bestand" eruit toen die niets in het grootboek zette.
    expect(deriveFlowState(snapshot, ledger).activeStepId).toBe("data");
    expect(deriveFlowState(snapshot, ledger).activeStepId).toBe("data");
  });
});

describe("bevestiging telt zwaarder dan het tijdstip van het feit", () => {
  it("een later bevestigde stap is niet achterhaald door een eerdere stap", () => {
    const { snapshot, ledger } = demoVolgorde();
    const state = deriveFlowState(snapshot, bevestig(ledger, "data", "2026-01-05T09:10:00.000Z"));
    expect(state.steps.find((s) => s.id === "data")!.status).not.toBe("stale");
  });

  it("maar een bevestiging van vóór de wijziging bovenstrooms wél", () => {
    // Bevestigd om 09:01, doel gewijzigd om 09:05: die bevestiging ging over iets van vóór de
    // wijziging en zegt dus niets meer. Veroudering moet hier gewoon blijven werken — de
    // gebruiker hoort terug naar stap 2 om het bestand opnieuw te bevestigen.
    //
    // De stap toont zich dan als "active" en niet als "stale": waar de gebruiker stáát gaat in
    // de balk vóór elk ander etiket (zie lib/flow/state.ts). Dat de veroudering werkte, blijkt
    // eruit dat stap 2 de actieve stap is terwijl alle feiten voor stap 3 klaarliggen.
    const { snapshot, ledger } = demoVolgorde();
    const state = deriveFlowState(snapshot, bevestig(ledger, "data", "2026-01-05T09:01:00.000Z"));
    expect(state.activeStepId).toBe("data");
    expect(state.steps.find((s) => s.id === "data")!.status).not.toBe("done");
  });
});
