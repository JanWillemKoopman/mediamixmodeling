// Het golden transcript: de vaste begeleiding, vastgelegd.
//
// De teksten waarmee de gids elke stap opent zijn een product-artefact, geen modeluitvoer.
// Ze bepalen of een niet-technische gebruiker snapt waar hij is — en ze zijn precies het
// soort ding dat ongemerkt verschuift. Deze snapshot maakt elke wijziging zichtbaar in de
// diff van een pull request, in plaats van pas bij een gebruiker.
//
// Loopt deze test rood na een bewuste tekstwijziging: lees de diff, controleer of de nieuwe
// tekst nog aan de regels hieronder voldoet, en werk de snapshot bij met `vitest -u`.

import { describe, expect, it } from "vitest";
import { STEPS, STEP_ORDER } from "@/lib/flow/steps";

describe("de begeleidende teksten", () => {
  it("liggen vast", () => {
    const transcript = STEP_ORDER.map((id) => {
      const step = STEPS[id];
      return `## ${step.number}. ${step.label}\n\n${step.opening}`;
    }).join("\n\n---\n\n");
    expect(transcript).toMatchSnapshot();
  });

  it("spreken de gebruiker aan, niet de bouwer", () => {
    for (const id of STEP_ORDER) {
      const text = STEPS[id].opening.toLowerCase();
      // Vaktaal die een marketeer niet uit zichzelf zou zeggen. De uitleg van wat het model
      // dóet mag; de naam van de techniek erachter voegt voor deze lezer niets toe.
      for (const jargon of [
        "bayesiaans",
        "posterior",
        "prior-elicitatie",
        "mcmc",
        "convergentie",
        "r-hat",
        "adstock",
        "saturatie",
        "collineair",
        "confounding",
        "outlier",
        "anomalie",
      ]) {
        expect(text.includes(jargon), `stap "${id}" gebruikt jargon: ${jargon}`).toBe(false);
      }
    }
  });

  it("beloven niets wat niet bestaat", () => {
    // De oude tuning-tekst beloofde een "proefdraai" en "geavanceerde rekeninstellingen" die
    // nergens bestonden (lib/wizard/script.ts:72-74). Wat de gebruiker kán doen, komt nu uit
    // de acties van de stap; de openingstekst mag er geen handelingen bij verzinnen.
    for (const id of STEP_ORDER) {
      const text = STEPS[id].opening.toLowerCase();
      for (const promise of ["proefdraai", "geavanceerd", "instellingen aanpassen", "sliders"]) {
        expect(text.includes(promise), `stap "${id}" belooft: ${promise}`).toBe(false);
      }
    }
  });

  it("zijn kort genoeg om te lezen", () => {
    for (const id of STEP_ORDER) {
      const words = STEPS[id].opening.split(/\s+/).length;
      expect(words, `stap "${id}" is te lang (${words} woorden)`).toBeLessThan(130);
      expect(words, `stap "${id}" is wel erg kort`).toBeGreaterThan(15);
    }
  });
});
