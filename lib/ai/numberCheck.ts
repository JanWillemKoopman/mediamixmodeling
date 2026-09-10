// Is elk getal in een gegenereerde tekst herleidbaar tot de uitkomst?
//
// Dit is de belofte uit docs/CHAT_PIPELINE_HERZIENING.md §8.4. Het enige echte
// hallucinatierisico van dit product zit in de uitlegtekst bij de uitkomst: een verzonnen
// percentage in een verder kloppende zin is niet te onderscheiden van een juist percentage, en
// de lezer heeft geen enkele manier om het verschil te zien.
//
// De hoofdgetallen worden daarom door code gerenderd (lib/flow/outcome.ts). Voor de tekst
// eromheen is dit het vangnet: alle getallen die in de `FitSummary` staan of er rechtstreeks
// uit volgen, vormen de toegestane verzameling. Wat daarbuiten valt is niet te verantwoorden.
//
// Wat dit NIET is: een waarheidstoets. Een model kan met kloppende getallen een onjuiste
// conclusie trekken. Dit sluit alleen de categorie uit die niemand kan nacontroleren.

import { moneyKpis } from "@/lib/dashboardInsights";
import type { FitSummary } from "@/lib/types";

/** Relatieve marge. De gids wordt gevraagd af te ronden op presenteerbare getallen. */
const TOLERANCE = 0.02;

/**
 * Elk getal dat uit de uitkomst volgt.
 *
 * Niet alleen de ruwe velden: ook de vormen waarin ze gepresenteerd worden — een aandeel als
 * percentage, een som over de kanalen, een afgerond bedrag. Anders zou "20%" voor een aandeel
 * van 0,2 als verzonnen gelden.
 */
export function allowedNumbers(summary: FitSummary): Set<number> {
  const allowed = new Set<number>();
  const add = (value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    allowed.add(Math.abs(value));
    // Een verhouding wordt als percentage opgeschreven.
    allowed.add(Math.abs(value * 100));
    // En een percentage soms als verhouding.
    allowed.add(Math.abs(value / 100));
  };

  const walk = (value: unknown) => {
    if (typeof value === "number") {
      add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value)) walk(nested);
    }
  };
  walk(summary);

  // De afgeleide geldgetallen die het dashboard en de uitkomstlagen tonen — dezelfde bron, dus
  // de gids mag ze noemen.
  const money = moneyKpis(summary);
  for (const value of [
    money.totalSpend,
    money.marketing.p3,
    money.marketing.p50,
    money.marketing.p97,
    money.blendedRoas,
    money.baselineSharePct,
    money.totalKpi,
  ]) {
    add(value);
  }
  // Het aantal kanalen en weken wordt in woorden meegenomen ("acht kanalen", "104 weken").
  add(summary.channels.length);
  add(summary.n_weeks);

  return allowed;
}

/** Getallen uit de tekst halen, met Nederlandse opmaak (1.234,5) meegerekend. */
export function numbersIn(text: string): { raw: string; value: number }[] {
  const found: { raw: string; value: number }[] = [];
  // Twee vormen, in deze volgorde: eerst de Nederlandse duizendscheiding (1.234.567,89), dan
  // een gewoon getal met komma óf punt als decimaalteken. De volgorde telt: zou de tweede vorm
  // vooraan staan, dan bleef van "0.82" alleen "0" over en werd "82" een los tweede getal.
  const THOUSANDS = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/;
  for (const match of text.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g)) {
    const raw = match[0];
    // "1.234,5" → 1234.5; "0.82" en "2,4" → 0.82 en 2.4.
    const normalised = THOUSANDS.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(",", ".");
    const value = Number(normalised);
    if (Number.isFinite(value)) found.push({ raw, value });
  }
  return found;
}

export interface NumberCheck {
  ok: boolean;
  /** De getallen die nergens in de uitkomst terug te vinden zijn. */
  unverifiable: string[];
}

/**
 * Toets een gegenereerde tekst.
 *
 * Jaartallen en weeknummers uit het datavenster worden toegelaten: die staan in de tekst als
 * datum, niet als uitkomst. Kleine gehele getallen tot en met 12 ook — dat zijn opsommingen
 * ("drie kanalen", "de eerste 4 weken") en geen beweringen over de uitkomst.
 */
export function checkNumbers(text: string, summary: FitSummary): NumberCheck {
  const allowed = allowedNumbers(summary);
  const years = new Set<number>();
  for (const bound of summary.window) {
    const year = Number(String(bound).slice(0, 4));
    if (Number.isFinite(year)) years.add(year);
  }

  const unverifiable: string[] = [];
  for (const { raw, value } of numbersIn(text)) {
    const magnitude = Math.abs(value);
    if (magnitude <= 12) continue; // opsommingen, niet beweringen
    if (years.has(magnitude)) continue; // een jaartal uit het datavenster
    const matches = [...allowed].some((candidate) => {
      if (candidate === 0) return magnitude === 0;
      return Math.abs(candidate - magnitude) / Math.max(1, Math.abs(candidate)) <= TOLERANCE;
    });
    if (!matches) unverifiable.push(raw);
  }

  return { ok: unverifiable.length === 0, unverifiable };
}
