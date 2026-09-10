// Stap 7 — de uitkomst, in vier lagen.
//
// De volgorde is het hele punt. De oude review-stap gaf eerst het oordeel als label, dan een
// lijst eerdere runs, dan R², MAPE, dekking en ESS — en de uitleg in mensentaal zat achter
// twee menuopties die je zelf moest typen. Een niet-technische gebruiker kreeg dus eerst de
// statistiek en pas op verzoek de betekenis.
//
// Hier is het omgekeerd:
//   1. Kan ik hierop sturen?   — het oordeel als handeling, met de uitweg als het niet kan
//   2. Wat is er gebeurd?      — drie getallen en een paar zinnen
//   3. Wat zou ik doen?        — alleen als het oordeel budgetadvies toestaat
//   4. De cijfers en techniek  — ingeklapt
//
// Elke laag hangt aan `allows()`. Die poort verandert niet: wat hier gebeurt is uitsluitend
// een andere volgorde en andere woorden.
//
// En: ELK GETAL IN DEZE LAGEN KOMT UIT CODE. De gids mag de duiding eromheen schrijven, niet
// de cijfers zelf (zie docs/CHAT_PIPELINE_HERZIENING.md §8.4) — een verzonnen percentage in
// een verder kloppende zin is niet te onderscheiden van een juist percentage.

import { moneyKpis, recommendedActions, type RecommendedAction } from "@/lib/dashboardInsights";
import { VALIDATION_LEVEL_LABEL, allows, type FitSummary, type Interval, type ModelValidation } from "@/lib/types";
import type { StepId } from "@/lib/flow/steps";

// --- laag 1: kan ik hierop sturen? ------------------------------------------------------

export interface SteerVerdict {
  tone: "good" | "partial" | "blocked";
  /** Wat je met deze uitkomst kunt, in één regel. Geen niveaunaam, een handeling. */
  headline: string;
  /** Waarom, in de woorden van de gebruiker. */
  explanation: string;
  /** Wat er mis is — al in mensentaal uit mmm_core.model.validate. */
  reasons: string[];
  /** Waar je heen moet om dit te verbeteren; leeg als er niets te verbeteren valt. */
  remedy: { step: StepId; label: string; why: string } | null;
  /** Het technische niveau, voor wie het wil weten. Niet de kop. */
  levelLabel: string;
}

export function steerVerdict(validation: ModelValidation | null): SteerVerdict {
  if (!validation) {
    return {
      tone: "blocked",
      headline: "Deze berekening is nog niet beoordeeld.",
      explanation: "Zonder beoordeling laat ik geen cijfers zien — die zouden net zo goed onzin kunnen zijn.",
      reasons: [],
      remedy: null,
      levelLabel: "nog geen oordeel",
    };
  }

  const base = {
    reasons: [...validation.blocking_reasons, ...validation.warning_reasons],
    levelLabel: VALIDATION_LEVEL_LABEL[validation.level],
  };

  if (validation.level === "usable_for_decisions") {
    return {
      ...base,
      tone: "good",
      headline: "Hier kun je je budget op sturen.",
      explanation:
        "Het model is stabiel doorgerekend, volgt je historie, en kan je kanalen los van elkaar " +
        "beoordelen. Ook op weken die het niet heeft gezien klopt het.",
      reasons: validation.warning_reasons,
      remedy: null,
    };
  }

  if (validation.level === "statistically_valid") {
    return {
      ...base,
      tone: "partial",
      headline: "Je kunt dit lezen, maar er nog geen budget op verschuiven.",
      explanation:
        "Het model is betrouwbaar doorgerekend en je kunt zien wat elk kanaal heeft bijgedragen. " +
        "Voor een budgetadvies is meer nodig: dan moet ik ook kunnen aantonen dat het klopt op weken " +
        "die het model niet heeft gezien.",
      reasons: validation.warning_reasons,
      remedy: {
        step: "beliefs",
        label: "Opnieuw afstemmen",
        why: "Met scherpere verwachtingen, of door twee kanalen die te veel op elkaar lijken samen te nemen, komt dit vaak wel rond.",
      },
    };
  }

  if (validation.level === "technically_completed") {
    return {
      ...base,
      tone: "blocked",
      headline: "De berekening is af, maar ik vertrouw de uitkomst niet.",
      explanation:
        "Dat “klaar met rekenen” is, zegt niets over het antwoord. Dit model beschrijft je cijfers " +
        "niet goed genoeg om er iets uit te concluderen, dus laat ik de getallen niet zien.",
      remedy: {
        step: "prepare",
        label: "Terug naar je data",
        why: "Meestal zit het hier: een ontbrekende verklaring, een week die alles meesleurt, of te weinig weken.",
      },
    };
  }

  return {
    ...base,
    tone: "blocked",
    headline: "Deze berekening is niet bruikbaar.",
    explanation:
      "Er is iets fundamenteel misgegaan in de berekening zelf. Er valt niets uit af te lezen, ook " +
      "niet gedeeltelijk.",
    remedy: {
      step: "beliefs",
      label: "Opnieuw afstemmen",
      why: "Vaak is het model te zwaar voor deze data. Minder kanalen of een lager ingeschat aandeel van marketing helpt.",
    },
  };
}

// --- laag 2: wat is er gebeurd? ----------------------------------------------------------

export interface OutcomeFigure {
  label: string;
  /** Al opgemaakte waarde — de opmaak hoort bij het getal, niet bij de component. */
  value: string;
  /** De bandbreedte eromheen, als die bestaat. Onzekerheid verdwijnt nergens. */
  range: string | null;
  note: string | null;
}

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("nl-NL", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function range(interval: Interval, digits = 0): string {
  return `${fmt(interval.p3, digits)} – ${fmt(interval.p97, digits)}`;
}

/**
 * De drie getallen die bovenaan horen, uit `moneyKpis` — dezelfde bron als het
 * klantdashboard, dus dezelfde cijfers.
 *
 * Leeg wanneer het oordeel geen kanaalbijdragen toestaat: dan is er niets te tonen, en een
 * lege lijst is het juiste antwoord in plaats van nullen.
 */
export function headlineFigures(
  summary: FitSummary,
  validation: ModelValidation | null,
  kpiMargin?: number | null,
): OutcomeFigure[] {
  if (!allows(validation, "total_media_contribution")) return [];

  const money = moneyKpis(summary, kpiMargin);
  const isMoney = summary.kpi_type === "revenue";
  const figures: OutcomeFigure[] = [
    {
      label: `Door marketing gedreven ${summary.kpi}`,
      value: fmt(money.marketing.p50),
      range: range(money.marketing),
      note:
        money.baselineSharePct != null
          ? `De overige ${fmt(money.baselineSharePct)}% was er ook zonder campagnes geweest.`
          : null,
    },
  ];

  if (money.blendedRoas != null) {
    figures.push({
      label: isMoney ? "Omzet per bestede euro" : `${summary.kpi} per bestede euro`,
      value: fmt(money.blendedRoas, 2),
      range: null,
      note: `Over ${fmt(money.totalSpend)} aan media in deze periode.`,
    });
  }

  if (money.roiPct != null) {
    figures.push({
      label: "Netto rendement",
      value: `${fmt(money.roiPct)}%`,
      range: null,
      note: money.roiPct >= 0 ? "Je verdient meer terug dan je erin stopt." : "Je zet er meer in dan je terugkrijgt.",
    });
  }

  return figures;
}

/** Het kanaal dat het meeste bijdroeg, als er per kanaal iets te zeggen valt. */
export function strongestChannel(
  summary: FitSummary,
  validation: ModelValidation | null,
): { name: string; share: string; confidence: "breed" | "smal" } | null {
  if (!allows(validation, "channel_contributions")) return null;
  const usable = new Set(
    (validation?.per_channel ?? []).filter((c) => c.usable).map((c) => c.name),
  );
  const candidates = summary.channels.filter((c) => usable.size === 0 || usable.has(c.name));
  if (candidates.length === 0) return null;
  const best = [...candidates].sort((a, b) => b.contribution_share.p50 - a.contribution_share.p50)[0];
  const width = best.contribution_share.p97 - best.contribution_share.p3;
  return {
    name: best.name,
    share: `${fmt(best.contribution_share.p50 * 100, 1)}%`,
    // Een brede band is geen fout maar een eerlijke uitspraak; hij hoort wel benoemd te worden.
    confidence: width > Math.max(0.1, best.contribution_share.p50) ? "breed" : "smal",
  };
}

/** Kanalen die alleen samen te beoordelen zijn — hun totaal klopt, de verdeling niet. */
export function inseparableNote(validation: ModelValidation | null): string | null {
  const groups = validation?.inseparable_groups ?? [];
  if (groups.length === 0) return null;
  return groups
    .map(
      (group) =>
        `${group.join(" en ")} lijken zo op elkaar dat ik ze niet los kan beoordelen — hun totaal klopt, de verdeling ertussen niet.`,
    )
    .join(" ");
}

// --- laag 3: wat zou ik doen? ------------------------------------------------------------

/**
 * Het budgetadvies. Leeg tenzij het oordeel het toestaat — geld verschuiven op basis van een
 * model dat zijn eigen drempel niet haalt, is precies wat dit product moet uitsluiten.
 */
export function adviceFor(
  summary: FitSummary,
  validation: ModelValidation | null,
  kpiMargin?: number | null,
): RecommendedAction[] {
  if (!allows(validation, "budget_advice")) return [];
  return recommendedActions(summary, kpiMargin);
}
