// De controle op verzonnen getallen (docs/CHAT_PIPELINE_HERZIENING.md §8.4).
//
// Deze test bepaalt of het vangnet bruikbaar is. Te streng en elke uitlegtekst wordt geweigerd;
// te ruim en hij laat alles door. Beide kanten worden hier dus getoetst: een tekst met uitsluitend
// cijfers uit de uitkomst moet erdoor, en een tekst met één verzonnen getal moet eruit.

import { describe, expect, it } from "vitest";
import { allowedNumbers, checkNumbers, numbersIn } from "@/lib/ai/numberCheck";
import type { FitSummary, Interval } from "@/lib/types";

const iv = (p50: number, spread = 0.2): Interval => ({
  p3: p50 * (1 - spread),
  p50,
  p97: p50 * (1 + spread),
});

const SUMMARY: FitSummary = {
  kpi: "omzet",
  kpi_type: "revenue",
  n_weeks: 104,
  window: ["2024-01-01", "2025-12-29"],
  baseline_contribution: iv(400_000),
  channels: [
    {
      name: "tv",
      absolute_contribution: iv(120_000),
      contribution_share: iv(0.2, 0.1),
      roas: iv(2.4),
      adstock_half_life_weeks: iv(3),
      saturation_point: iv(8000),
      total_spend: 50_000,
      unit: "currency",
    },
    {
      name: "social",
      absolute_contribution: iv(60_000),
      contribution_share: iv(0.1, 0.1),
      roas: iv(1.2),
      adstock_half_life_weeks: iv(1),
      saturation_point: iv(4000),
      total_spend: 50_000,
      unit: "currency",
    },
  ],
  diagnostics: {
    max_r_hat: 1.01,
    min_ess_bulk: 900,
    min_ess_tail: 800,
    n_divergences: 0,
    min_e_bfmi: 0.9,
    r2: 0.82,
    mape: 0.09,
    n_max_treedepth: 0,
    interval_coverage_94: 0.94,
    interval_coverage_80: 0.8,
    interval_coverage_50: 0.5,
    residual_autocorrelation: 0.04,
    decomposition_ok: true,
  },
  draws: 1000,
  chains: 4,
  validation: null,
  identifiability: [],
};

describe("getallen uit een tekst halen", () => {
  it("leest Nederlandse opmaak", () => {
    expect(numbersIn("180.000 euro").map((n) => n.value)).toEqual([180000]);
    expect(numbersIn("2,4 keer").map((n) => n.value)).toEqual([2.4]);
    expect(numbersIn("1.234.567,89").map((n) => n.value)).toEqual([1234567.89]);
  });

  it("leest ook een punt als decimaalteken", () => {
    expect(numbersIn("een R² van 0.82").map((n) => n.value)).toEqual([0.82]);
  });

  it("vindt meerdere getallen in één zin", () => {
    expect(numbersIn("tussen 96.000 en 144.000").map((n) => n.value)).toEqual([96000, 144000]);
  });
});

describe("de toegestane verzameling", () => {
  it("bevat de ruwe waarden uit de uitkomst", () => {
    const allowed = allowedNumbers(SUMMARY);
    expect(allowed.has(120_000)).toBe(true);
    expect(allowed.has(400_000)).toBe(true);
    expect(allowed.has(2.4)).toBe(true);
  });

  it("bevat een aandeel ook als percentage", () => {
    // 0,2 staat in de uitkomst; "20%" in de tekst moet daarop terug te voeren zijn.
    expect(allowedNumbers(SUMMARY).has(20)).toBe(true);
  });

  it("bevat de afgeleide geldgetallen die het dashboard ook toont", () => {
    const allowed = allowedNumbers(SUMMARY);
    // Totale spend (100.000) en de som van de bijdragen (180.000) staan niet als veld in de
    // uitkomst maar volgen er rechtstreeks uit — dezelfde bron als de uitkomstlagen gebruiken.
    expect(allowed.has(100_000)).toBe(true);
    expect(allowed.has(180_000)).toBe(true);
  });
});

describe("de controle", () => {
  it("laat een tekst met uitsluitend cijfers uit de uitkomst door", () => {
    const text =
      "Marketing dreef naar schatting 180.000 omzet, realistisch tussen 144.000 en 216.000. " +
      "Tv was het sterkste kanaal met een aandeel van 20% en leverde ongeveer 2,4 per bestede euro op. " +
      "Over 104 weken gaf je 100.000 aan media uit.";
    expect(checkNumbers(text, SUMMARY)).toEqual({ ok: true, unverifiable: [] });
  });

  it("haalt er één verzonnen getal uit", () => {
    // Precies het geval dat niemand kan nacontroleren: de zin klopt, het getal niet.
    const text = "Tv leverde een aandeel van 37% op.";
    const check = checkNumbers(text, SUMMARY);
    expect(check.ok).toBe(false);
    expect(check.unverifiable).toContain("37");
  });

  it("accepteert afronding op presenteerbare getallen", () => {
    // De gids wordt gevraagd af te ronden; 2,4 → "2,4" en 144.000 → "144.000" moeten beide door,
    // en een lichte afronding eromheen ook.
    expect(checkNumbers("ongeveer 181.000 omzet", SUMMARY).ok).toBe(true);
    expect(checkNumbers("een kleine 2,45 per euro", SUMMARY).ok).toBe(true);
  });

  it("weigert een getal dat net buiten de marge valt", () => {
    // 250.000 is geen afronding van 180.000 — dat is een andere bewering.
    expect(checkNumbers("ongeveer 250.000 omzet", SUMMARY).ok).toBe(false);
  });

  it("laat jaartallen uit het datavenster staan", () => {
    expect(checkNumbers("van januari 2024 tot december 2025", SUMMARY).ok).toBe(true);
  });

  it("laat kleine opsommingen staan", () => {
    // "2 kanalen", "de eerste 4 weken" zijn geen beweringen over de uitkomst.
    expect(checkNumbers("Je hebt 2 kanalen en ik heb de eerste 4 weken niet meegerekend.", SUMMARY).ok).toBe(true);
  });

  it("laat een tekst zonder getallen altijd door", () => {
    expect(checkNumbers("Tv werkt bij jullie duidelijk langer door dan social.", SUMMARY).ok).toBe(true);
  });
});
