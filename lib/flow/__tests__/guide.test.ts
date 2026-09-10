// De gids-prompt: wat er in staat, en vooral wat er niet in kan staan.
//
// De oude architect-prompt was achtergelopen op de code. Hij instrueerde over `storage_path`,
// een knop "Controleer & voeg samen", en velden die bij de intent-refactor waren verdwenen —
// terwijl elders in dezelfde prompt stond dat die velden niet bestaan. Dat is de directe
// oorzaak van antwoorden die naast de flow staan (docs/CHAT_PIPELINE_HERZIENING.md §2.4).
//
// Die drift is nu structureel afgedicht: wat de gebruiker kan doen wordt gegenereerd uit de
// gedeclareerde acties, en de woordenschat uit dezelfde vraaglijsten die de kaart rendert.
// Deze tests bewaken dat het gegenereerd blijft in plaats van weer uitgeschreven te worden.

import { describe, expect, it } from "vitest";
import { GUIDE_SYSTEM, PRESET_ASK, briefing, proposeBeliefsTool, vocabularyBlock } from "@/lib/ai/guide";
import { CHANNEL_QUESTIONS, MEDIA_SHARE_QUESTION, SEASONALITY_QUESTION } from "@/lib/flow/beliefs";
import { deriveFlowState } from "@/lib/flow/state";
import { STEPS, STEP_ORDER } from "@/lib/flow/steps";
import { allWorlds } from "@/lib/flow/__tests__/worlds";

// Velden en knoppen die de oude prompt noemde en die niet bestaan. Komt een van deze terug,
// dan is de drift terug.
const VERDWENEN = [
  "storage_path",
  "Controleer & voeg samen",
  "channel_type",
  "expected_half_life",
  "l_max",
  "calibration",
  "student_t",
  "beta_sigma",
  "propose_prepare_recipe",
  "propose_model_intent",
  "record_business_context",
  "prepare-auto",
];

describe("de stabiele kern van de prompt", () => {
  it("noemt niets wat niet bestaat", () => {
    for (const gone of VERDWENEN) {
      expect(GUIDE_SYSTEM.includes(gone), `prompt noemt verdwenen veld: ${gone}`).toBe(false);
    }
  });

  it("geeft de gids één rol, niet twee tegenstrijdige", () => {
    // De oude prompt droeg op proactief te zijn én werd alleen bij vrij typen aangeroepen.
    // Hier leidt de flow en antwoordt de gids; dat moet er ook staan.
    expect(GUIDE_SYSTEM).toContain("De flow leidt");
    expect(GUIDE_SYSTEM.toLowerCase()).not.toContain("wacht niet tot de gebruiker");
  });

  it("verbiedt verzonnen getallen expliciet", () => {
    // Het gevaarlijkste wat de gids kan doen (§8.4): een verzonnen percentage in een verder
    // kloppende zin is niet te onderscheiden van een juist percentage.
    expect(GUIDE_SYSTEM).toContain("Verzin nooit");
    expect(GUIDE_SYSTEM).toContain("niet te onderscheiden");
  });

  it("blijft klein genoeg om te cachen en te lezen", () => {
    // Byte-identiek bij elke aanvraag is alleen waardevol als hij ook compact is.
    expect(GUIDE_SYSTEM.length).toBeLessThan(4000);
  });
});

describe("de woordenschat wordt gegenereerd", () => {
  it("bevat precies de waarden die de kaart aanbiedt", () => {
    const block = vocabularyBlock();
    for (const question of CHANNEL_QUESTIONS) {
      for (const option of question.options) {
        expect(block.includes(`"${option.value}"`), `${question.id}/${option.value} ontbreekt`).toBe(true);
      }
    }
    for (const option of [...SEASONALITY_QUESTION.options, ...MEDIA_SHARE_QUESTION.options]) {
      expect(block.includes(`"${option.value}"`), `${option.value} ontbreekt`).toBe(true);
    }
  });

  it("noemt geen waarde die de kaart niet kent", () => {
    const bekend = new Set([
      ...CHANNEL_QUESTIONS.flatMap((q) => q.options.map((o) => o.value as string)),
      ...SEASONALITY_QUESTION.options.map((o) => o.value as string),
      ...MEDIA_SHARE_QUESTION.options.map((o) => o.value as string),
    ]);
    // Elk woord tussen aanhalingstekens in de woordenschat moet een bestaande waarde zijn —
    // of de naam van de vraag zelf.
    const quoted = [...vocabularyBlock().matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    const vraagnamen = new Set(["carryover", "strength", "saturation", "seasonality", "media_share", "unknown"]);
    for (const word of quoted) {
      expect(bekend.has(word) || vraagnamen.has(word), `onbekende waarde in de prompt: ${word}`).toBe(true);
    }
  });
});

describe("het gereedschap", () => {
  it("heeft geen enkel numeriek veld", () => {
    // Een taalmodel kan hier het verkeerde wóórd kiezen; een absurd getal kan het niet, omdat
    // er geen getalveld is om in te vullen.
    const schema = JSON.stringify(proposeBeliefsTool(["tv", "social"]));
    expect(schema).not.toContain('"number"');
    expect(schema).not.toContain('"integer"');
  });

  it("laat alleen de waarden toe die de kaart kent", () => {
    const tool = proposeBeliefsTool(["tv"]);
    const props = (tool.input_schema as { properties: Record<string, unknown> }).properties;
    const channelProps = (
      props.channels as { additionalProperties: { properties: Record<string, { enum: string[] }> } }
    ).additionalProperties.properties;
    for (const question of CHANNEL_QUESTIONS) {
      expect(channelProps[question.id].enum.sort()).toEqual(question.options.map((o) => o.value as string).sort());
    }
  });

  it("noemt de echte kanaalnamen, zodat er geen verzonnen kanaal terugkomt", () => {
    const tool = proposeBeliefsTool(["tv_spend", "email_verzendingen"]);
    const props = (tool.input_schema as { properties: Record<string, { description?: string }> }).properties;
    expect(props.channels.description).toContain("tv_spend");
    expect(props.channels.description).toContain("email_verzendingen");
  });
});

describe("de briefing", () => {
  const worlds = allWorlds();

  it("noemt in elke toestand alleen knoppen die er echt zijn", () => {
    // Dit is de kern van de reparatie. De prompt beschrijft de knoppen niet uit het hoofd maar
    // leest ze af, dus hij kan er geen verzinnen — en een knop die erbij komt staat er meteen in.
    for (const { snapshot, ledger } of worlds.slice(0, 200)) {
      const state = deriveFlowState(snapshot, ledger);
      for (const stepId of STEP_ORDER) {
        const text = briefing(snapshot, state, stepId);
        const step = state.steps.find((s) => s.id === stepId)!;
        for (const action of step.actions) {
          expect(text.includes(`"${action.label}"`), `${stepId}: ${action.label} ontbreekt in de briefing`).toBe(true);
        }
        // En geen knoppen van een andere stap in dezelfde opsomming.
        const andere = state.steps
          .filter((s) => s.id !== stepId)
          .flatMap((s) => s.actions.map((a) => a.label))
          .filter((label) => !step.actions.some((a) => a.label === label));
        const knoppenDeel = text.slice(text.indexOf("De knoppen die de gebruiker nu ziet"));
        for (const label of andere) {
          if (!knoppenDeel) continue;
          expect(
            knoppenDeel.split("\n\n")[0].includes(`"${label}"`),
            `${stepId}: knop van een andere stap in de opsomming: ${label}`,
          ).toBe(false);
        }
      }
    }
  });

  it("zegt in welke stap de gebruiker staat", () => {
    const { snapshot, ledger } = worlds[0];
    const state = deriveFlowState(snapshot, ledger);
    for (const stepId of STEP_ORDER) {
      const text = briefing(snapshot, state, stepId);
      expect(text).toContain(`stap ${STEPS[stepId].number} van 8`);
      expect(text).toContain(STEPS[stepId].label);
    }
  });

  it("geeft de woordenschat alleen mee waar hij nodig is", () => {
    const { snapshot, ledger } = worlds[worlds.length - 1];
    const state = deriveFlowState(snapshot, ledger);
    expect(briefing(snapshot, state, "beliefs")).toContain("gesloten woordenschat");
    expect(briefing(snapshot, state, "data")).not.toContain("gesloten woordenschat");
  });

  it("verzint geen feiten als er niets ligt", () => {
    const leeg = worlds.find((w) => w.spec.source === false && w.spec.dataset === null)!;
    const state = deriveFlowState(leeg.snapshot, leeg.ledger);
    expect(briefing(leeg.snapshot, state, "data")).toContain("Er ligt nog niets vast");
  });
});

describe("de vaste vragen achter de AI-knoppen", () => {
  it("bestaan voor elke knop die erom vraagt", () => {
    for (const id of ["beliefs.suggest", "launch.diagnose", "results.explain"]) {
      expect(PRESET_ASK[id], id).toBeTruthy();
      expect(PRESET_ASK[id].length, id).toBeGreaterThan(40);
    }
  });

  it("vragen de gids nooit om zelf te rekenen of te schatten", () => {
    // Woordgrenzen, geen substring: "berekening" is een zelfstandig naamwoord en mag, "bereken"
    // als opdracht niet. Die twee door elkaar halen maakte deze test eerst onjuist rood.
    for (const [id, text] of Object.entries(PRESET_ASK)) {
      for (const verb of ["bereken", "schat", "reken uit", "voorspel"]) {
        const imperative = new RegExp(`\\b${verb}\\b`, "i");
        expect(imperative.test(text), `${id} vraagt de gids om te "${verb}"`).toBe(false);
      }
    }
  });

  it("wijzen de gids op de cijfers die hij heeft gekregen", () => {
    // De uitlegvraag is de enige waar getallen in het antwoord horen, en daar moet expliciet
    // staan dat ze uit de context komen.
    expect(PRESET_ASK["results.explain"]).toContain("uitsluitend de cijfers");
    expect(PRESET_ASK["results.explain"]).toContain("bandbreedte");
  });
});
