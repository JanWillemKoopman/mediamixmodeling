// De zes invarianten uit docs/CHAT_PIPELINE_HERZIENING.md §8.2, getoetst over álle
// toestanden die de flow kan aannemen (lib/flow/__tests__/worlds.ts).
//
// Het verschil met gewone tests: dit zijn geen scenario's maar eigenschappen. "De gebruiker
// loopt nooit vast" is niet iets wat je in drie voorbeelden aantoont — het is iets wat voor
// elke toestand moet gelden, en dat is hier precies wat er staat.

import { describe, expect, it } from "vitest";
import { deriveFlowState, activeStep, availableActions } from "@/lib/flow/state";
import { STEPS, STEP_ORDER, type StepId } from "@/lib/flow/steps";
import { humanizeError } from "@/lib/humanizeMessage";
import { allows, RUN_STATE_LABEL, type RunErrorCode } from "@/lib/types";
import { allWorlds, describeWorld, staleWorlds } from "@/lib/flow/__tests__/worlds";

const WORLDS = allWorlds();

describe("de toestandsruimte zelf", () => {
  it("spant meer dan duizend toestanden op", () => {
    // Een vangnet onder de generator: raakt hij per ongeluk uitgekleed (een dimensie die
    // niet meer varieert), dan zeggen alle invarianten hieronder nog steeds "groen" over
    // een handvol gevallen. Dan is dat geen bewijs meer, en dat moet opvallen.
    expect(WORLDS.length).toBeGreaterThan(1000);
  });
});

// --- Invariant 1 -----------------------------------------------------------------------
// Nooit een doodlopende toestand. Dit is de invariant die "ik weet niet wat ik nu moet doen"
// onmogelijk maakt — de klacht waar deze hele herziening mee begon.
describe("invariant 1 — nooit een doodlopende toestand", () => {
  it("elke toestand biedt een actie, of legt uit dat er iets loopt", () => {
    for (const { spec, snapshot, ledger } of WORLDS) {
      const state = deriveFlowState(snapshot, ledger);
      const step = activeStep(state);
      const hasWayForward = availableActions(state).length > 0 || step.status === "waiting";
      expect(hasWayForward, `doodlopend: ${describeWorld(spec)}`).toBe(true);
    }
  });

  it("wachten gaat altijd samen met wat er gebeurt en hoe lang dat hoort te duren", () => {
    for (const { spec, snapshot, ledger } of WORLDS) {
      const step = activeStep(deriveFlowState(snapshot, ledger));
      if (step.status !== "waiting") continue;
      expect(step.waiting, describeWorld(spec)).not.toBeNull();
      expect(step.waiting!.stage.length, describeWorld(spec)).toBeGreaterThan(0);
      expect(step.waiting!.expectation.length, describeWorld(spec)).toBeGreaterThan(0);
      expect(step.waiting!.stallAfterMinutes, describeWorld(spec)).toBeGreaterThan(0);
    }
  });

  it("een geblokkeerde stap zegt altijd waarom", () => {
    for (const { spec, snapshot, ledger } of WORLDS) {
      for (const step of deriveFlowState(snapshot, ledger).steps) {
        if (step.status !== "blocked") continue;
        expect(step.blockedReason, `${step.id} in ${describeWorld(spec)}`).toBeTruthy();
      }
    }
  });
});

// --- Invariant 2 -----------------------------------------------------------------------
// De getoonde stap volgt uit de feiten — nooit uit een positie in een lijst.
describe("invariant 2 — de getoonde stap volgt uit de feiten", () => {
  it("er is altijd precies één actieve stap", () => {
    for (const { spec, snapshot, ledger } of WORLDS) {
      const state = deriveFlowState(snapshot, ledger);
      const actives = state.steps.filter((s) => s.status === "active" || s.status === "waiting");
      expect(actives.length, describeWorld(spec)).toBe(1);
      expect(actives[0].id, describeWorld(spec)).toBe(state.activeStepId);
    }
  });

  it("elke stap heeft precies één status, en die is bekend", () => {
    const known = new Set(["todo", "blocked", "active", "waiting", "done", "stale"]);
    for (const { spec, snapshot, ledger } of WORLDS) {
      const state = deriveFlowState(snapshot, ledger);
      expect(state.steps.length, describeWorld(spec)).toBe(STEP_ORDER.length);
      for (const step of state.steps) expect(known.has(step.status), `${step.id}: ${step.status}`).toBe(true);
    }
  });

  it("afgerond betekent dat het feit er is — geen vinkje voor een overgeslagen stap", () => {
    // Precies de fout die de oude balk maakte (done = i < activeStep).
    for (const { spec, snapshot, ledger } of WORLDS) {
      const state = deriveFlowState(snapshot, ledger);
      for (const step of state.steps) {
        if (step.status !== "done") continue;
        const isDone = STEPS[step.id].isDone({ snapshot, ledger });
        expect(isDone, `${step.id} heet afgerond maar het feit ontbreekt: ${describeWorld(spec)}`).toBe(true);
      }
    }
  });

  it("een stap die nog niet af is, staat nooit als afgerond", () => {
    for (const { spec, snapshot, ledger } of WORLDS) {
      const state = deriveFlowState(snapshot, ledger);
      for (const step of state.steps) {
        if (STEPS[step.id].isDone({ snapshot, ledger })) continue;
        expect(step.status, `${step.id} in ${describeWorld(spec)}`).not.toBe("done");
        expect(step.status, `${step.id} in ${describeWorld(spec)}`).not.toBe("stale");
      }
    }
  });

  it("een latere wijziging bovenstrooms maakt wat eronder hangt achterhaald", () => {
    for (const { spec, snapshot, ledger } of staleWorlds()) {
      const state = deriveFlowState(snapshot, ledger);
      const redone = spec.redoneStep!;
      const downstream = STEP_ORDER.slice(STEP_ORDER.indexOf(redone) + 1);
      const affected = state.steps.filter((s) => downstream.includes(s.id));
      // Alles wat ná de opnieuw gedane stap komt, is óf achterhaald, óf weer aan de beurt.
      const stillSilentlyDone = affected.filter((s) => s.status === "done");
      expect(
        stillSilentlyDone.map((s) => s.id),
        `na opnieuw doen van ${redone} bleef dit stilzwijgend geldig`,
      ).toEqual([]);
      const staleOnes = affected.filter((s) => s.status === "stale");
      for (const s of staleOnes) expect(s.staleBecauseOf, `${s.id} zegt niet waardoor`).toBeTruthy();
    }
  });
});

// --- Invariant 3 -----------------------------------------------------------------------
// Geen getal zonder zijn oordeel. De poort zelf is allows(); hier toetsen we dat de flow er
// nergens omheen loopt.
describe("invariant 3 — geen getal zonder zijn oordeel", () => {
  it("delen kan alleen als het oordeel dat toestaat", () => {
    for (const { spec, snapshot, ledger } of WORLDS) {
      const state = deriveFlowState(snapshot, ledger);
      const share = state.steps.find((s) => s.id === "share")!;
      const run = snapshot.runs.find((r) => r.run.state === "completed") ?? null;
      const mayPublish = run != null && allows(run.validation, "publish");
      const offersPublish = share.actions.some((a) => a.id === "share.publish");
      if (!mayPublish) {
        expect(offersPublish, `deelknop terwijl het niet mag: ${describeWorld(spec)}`).toBe(false);
        expect(share.status, describeWorld(spec)).not.toBe("done");
      }
    }
  });

  it("een onvoldoende model biedt uitwegen in plaats van een volgende stap", () => {
    for (const { spec, snapshot, ledger } of WORLDS) {
      if (spec.run !== "completed") continue;
      if (spec.level === "statistically_valid" || spec.level === "usable_for_decisions") continue;
      const state = deriveFlowState(snapshot, ledger);
      const results = state.steps.find((s) => s.id === "results")!;
      expect(
        results.actions.some((a) => a.id === "results.accept"),
        `"ga door" aangeboden bij oordeel ${spec.level}: ${describeWorld(spec)}`,
      ).toBe(false);
      // Maar wél een weg vooruit: opnieuw afstemmen of terug naar de data.
      expect(results.actions.length, describeWorld(spec)).toBeGreaterThan(0);
      expect(results.actions.some((a) => a.goTo != null), describeWorld(spec)).toBe(true);
    }
  });
});

// --- Invariant 4 -----------------------------------------------------------------------
// Elke fout heeft mensentaal én een uitweg.
describe("invariant 4 — elke fout heeft mensentaal en een uitweg", () => {
  const ERROR_CODES: RunErrorCode[] = [
    "DATA_QUALITY",
    "CONFIG_INVALID",
    "PRIOR_GATE_FAILED",
    "SAMPLING_FAILED",
    "TIMEOUT",
    "OOM",
    "STORAGE_UNAVAILABLE",
    "CANCELLED",
    "INTERNAL",
  ];

  it("elke foutcode levert een leesbare tekst op", () => {
    for (const code of ERROR_CODES) {
      const { text } = humanizeError(code, "Er ging iets mis.");
      expect(text.length, code).toBeGreaterThan(0);
      // Geen kale foutcode of stacktrace voor de gebruiker.
      expect(text, code).not.toMatch(/Traceback|^[A-Z_]+$/);
    }
  });

  it("een mislukte berekening laat de gebruiker nooit stilstaan", () => {
    for (const { spec, snapshot, ledger } of WORLDS) {
      if (spec.run !== "failed") continue;
      const state = deriveFlowState(snapshot, ledger);
      expect(availableActions(state).length, describeWorld(spec)).toBeGreaterThan(0);
    }
  });

  it("een mislukte datavoorbereiding laat de gebruiker nooit stilstaan", () => {
    for (const { spec, snapshot, ledger } of WORLDS) {
      if (spec.dataset !== "failed") continue;
      const state = deriveFlowState(snapshot, ledger);
      expect(availableActions(state).length, describeWorld(spec)).toBeGreaterThan(0);
    }
  });

  it("elke stap van de rekenmachine heeft een naam in mensentaal", () => {
    for (const [state, label] of Object.entries(RUN_STATE_LABEL)) {
      expect(label.length, state).toBeGreaterThan(0);
    }
  });
});

// --- Invariant 5 -----------------------------------------------------------------------
// Onomkeerbaar betekent bevestigd. De lijst hieronder is de specificatie; steps.ts moet er
// exact op uitkomen. Beide richtingen worden getoetst: een blijvende actie zonder vlag is
// een gat, een onschuldige actie mét vlag is een onnodige drempel.
describe("invariant 5 — onomkeerbaar betekent bevestigd", () => {
  const LASTING = new Set([
    "data.replace", // gooit het bestaande bestand overboord
    "prepare.start", // start het samenvoegen
    "prepare.retry",
    "prepare.rebuild",
    "prepare.approve", // hierna mag erop gerekend worden
    "launch.start", // een berekening van minuten
    "launch.retry",
    "launch.again",
    "share.publish", // de klant ziet dit
  ]);

  it("precies de blijvende handelingen vragen om bevestiging", () => {
    const seen = new Set<string>();
    for (const { spec, snapshot, ledger } of WORLDS) {
      for (const step of deriveFlowState(snapshot, ledger).steps) {
        for (const action of step.actions) {
          seen.add(action.id);
          expect(action.confirms, `${action.id} in ${describeWorld(spec)}`).toBe(LASTING.has(action.id));
        }
      }
    }
    // En elke handeling uit de specificatie komt ergens ook echt voor: een vergeten actie
    // zou anders stilletjes uit de lijst kunnen verdwijnen zonder dat een test klaagt.
    for (const id of LASTING) expect(seen.has(id), `${id} bestaat nergens meer`).toBe(true);
  });

  it("een bevestiging zegt altijd waarvoor je tekent", () => {
    // Anders is het geen bevestiging maar een extra klik, en klikt de gebruiker hem weg.
    for (const { spec, snapshot, ledger } of WORLDS) {
      for (const step of deriveFlowState(snapshot, ledger).steps) {
        for (const action of step.actions) {
          if (!action.confirms) continue;
          expect(action.confirmPrompt, `${action.id} in ${describeWorld(spec)}`).toBeTruthy();
          expect(action.confirmPrompt!.length, action.id).toBeGreaterThan(20);
        }
      }
    }
  });
});

// --- Invariant 6 -----------------------------------------------------------------------
// Elke stap is af te ronden zonder te typen. Dit is de operationele definitie van "geen
// technische kennis nodig" — en het is de reden dat de menu-parser verdwijnt.
describe("invariant 6 — elke stap is af te ronden zonder te typen", () => {
  it("de actieve stap biedt altijd minstens één handeling die geen tekst vraagt", () => {
    for (const { spec, snapshot, ledger } of WORLDS) {
      const state = deriveFlowState(snapshot, ledger);
      const step = activeStep(state);
      if (step.status === "waiting") continue;
      if (!STEPS[step.id].completableWithoutTyping) continue;
      const clickable = step.actions.filter((a) => !a.needsText);
      expect(clickable.length, `${step.id} vraagt om typen: ${describeWorld(spec)}`).toBeGreaterThan(0);
    }
  });

  it("elke stap belooft dat ook", () => {
    // Voorlopig geldt het voor alle acht. Zodra een stap dat niet meer kan waarmaken, moet
    // dat een bewuste wijziging in steps.ts zijn en niet iets wat ongemerkt gebeurt.
    for (const id of STEP_ORDER) {
      expect(STEPS[id as StepId].completableWithoutTyping, id).toBe(true);
    }
  });
});

// --- Samenhang van de definities zelf ---------------------------------------------------
describe("de stapdefinities hangen samen", () => {
  it("de nummering loopt gelijk met de volgorde", () => {
    STEP_ORDER.forEach((id, i) => expect(STEPS[id].number, id).toBe(i + 1));
  });

  it("elke stap hangt alleen van eerdere stappen af", () => {
    for (const id of STEP_ORDER) {
      for (const dep of STEPS[id].dependsOn) {
        expect(STEP_ORDER.indexOf(dep), `${id} hangt van later af`).toBeLessThan(STEP_ORDER.indexOf(id));
      }
    }
  });

  it("elke stap legt uit waaróm hij bestaat", () => {
    for (const id of STEP_ORDER) {
      expect(STEPS[id].purpose.length, id).toBeGreaterThan(20);
      expect(STEPS[id].label.length, id).toBeGreaterThan(0);
    }
  });

  it("actie-ids zijn uniek en beginnen met hun eigen stap", () => {
    for (const { snapshot, ledger } of WORLDS) {
      for (const step of deriveFlowState(snapshot, ledger).steps) {
        const ids = step.actions.map((a) => a.id);
        expect(new Set(ids).size, `dubbele actie in ${step.id}`).toBe(ids.length);
        for (const id of ids) expect(id.startsWith(`${step.id}.`), id).toBe(true);
      }
    }
  });
});
