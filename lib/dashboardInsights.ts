// Afgeleide, presentatieklare inzichten uit een FitSummary — de vertaalslag van "ruwe
// modeloutput" naar "wat betekent dit voor mijn budget?". Bewust losse, pure functies
// (geen React) zodat het dashboard, de scenarioplanner én een toekomstige PDF-export
// dezelfde cijfers en dezelfde woorden gebruiken. Alles hier is deterministisch: het leest
// uitsluitend getallen die al in de FitSummary staan, geen extra rekengang of AI-aanroep.

import type { FitSummary, Interval, ResponseCurve } from "./types";

// --- Geld-KPI's: de vier/vijf getallen voor de directietafel -------------------------

export interface MoneyKpis {
  totalSpend: number;
  // Door marketing gedreven KPI over de hele periode (som van de kanaalbijdragen), met band.
  marketing: Interval;
  // Blended ROAS: marketing-KPI ÷ spend. Voor een omzet-KPI direct leesbaar; voor een
  // tel-KPI (orders/leads) is dit "KPI per bestede euro".
  blendedRoas: number | null;
  // Netto rendement in % — alleen als de marge (waarde per KPI-eenheid) bekend is.
  roiPct: number | null;
  // Aandeel van de KPI dat er ook zonder marketing was (basislijn ÷ totaal).
  baselineSharePct: number | null;
  // Totale KPI over de periode (basislijn + marketing, of de som van 'actual' als die er is).
  totalKpi: number;
}

export function moneyKpis(summary: FitSummary, kpiMargin?: number | null): MoneyKpis {
  const totalSpend = summary.channels.reduce((s, ch) => s + ch.total_spend, 0);
  const marketing: Interval = {
    p3: summary.channels.reduce((s, ch) => s + ch.absolute_contribution.p3, 0),
    p50: summary.channels.reduce((s, ch) => s + ch.absolute_contribution.p50, 0),
    p97: summary.channels.reduce((s, ch) => s + ch.absolute_contribution.p97, 0),
  };
  const totalKpi = summary.weekly
    ? summary.weekly.actual.reduce((s, v) => s + v, 0)
    : marketing.p50 + summary.baseline_contribution.p50;
  return {
    totalSpend,
    marketing,
    blendedRoas: totalSpend > 0 ? marketing.p50 / totalSpend : null,
    roiPct: kpiMargin != null && totalSpend > 0 ? ((marketing.p50 * kpiMargin - totalSpend) / totalSpend) * 100 : null,
    baselineSharePct: totalKpi > 0 ? (summary.baseline_contribution.p50 / totalKpi) * 100 : null,
    totalKpi,
  };
}

// --- Modelvertrouwen: TWEE lagen i.p.v. één samengeraapt oordeel ---------------------
//
// Een PyMC/MCMC-fit kan op twee onafhankelijke manieren "niet goed genoeg" zijn, en die
// twee vragen hebben een andere remedie:
//   1. Sampler-betrouwbaarheid — is er wel goed gesampled? (R-hat, ESS, divergenties).
//      Slecht hier ⇒ terug naar tuning (priors, rekeninstellingen).
//   2. Modelfit & plausibiliteit — is de uitkomst inhoudelijk goed? (R², MAPE, dekking,
//      decompositie). Slecht hier ⇒ terug naar data-inspectie/-voorbereiding (variabelen,
//      dummy's, uitschieters).
// De oude, samengevoegde trustVerdict() maakte dit onderscheid niet zichtbaar — een hoge
// R-hat en een lage R² kregen dezelfde ene "zwak"-badge, zonder aanwijzing WAAR de bouwer
// iets aan moet doen. layeredTrustVerdict() splitst dat expliciet.

export type TrustLevel = "goed" | "let_op" | "zwak";

export interface TrustVerdict {
  level: TrustLevel;
  headline: string;
  reasons: string[];
}

export interface LayeredTrustVerdict {
  sampler: TrustVerdict;
  fit: TrustVerdict;
  overall: TrustLevel;
}

const SAMPLER_KEYWORDS = ["r-hat", "converge", "divergent", "divergenti", "steekproef", "ess"];

function isSamplerReason(reason: string): boolean {
  const lower = reason.toLowerCase();
  return SAMPLER_KEYWORDS.some((k) => lower.includes(k));
}

function trustHeadline(level: TrustLevel, layer: "sampler" | "fit"): string {
  if (layer === "sampler") {
    return level === "goed"
      ? "Sampler is goed geconvergeerd"
      : level === "let_op"
        ? "Sampler-convergentie is krap — lees met aandacht"
        : "Sampler is niet betrouwbaar gesampled";
  }
  return level === "goed"
    ? "Uitkomst is plausibel"
    : level === "let_op"
      ? "Uitkomst is bruikbaar, maar met kanttekeningen"
      : "Uitkomst is inhoudelijk niet plausibel genoeg";
}

const worst = (a: TrustLevel, b: TrustLevel): TrustLevel => {
  const rank: Record<TrustLevel, number> = { goed: 0, let_op: 1, zwak: 2 };
  return rank[a] >= rank[b] ? a : b;
};

// Twee-laags oordeel (blueprint stap 7): sampler-betrouwbaarheid apart van modelfit &
// plausibiliteit, elk met eigen niveau + redenen, zodat de UI gericht kan doorverwijzen
// ("terug naar tuning" vs. "terug naar data") in plaats van één ondifferentieerde badge.
export function layeredTrustVerdict(summary: FitSummary): LayeredTrustVerdict {
  const d = summary.diagnostics;
  const gate = summary.quality_gate;

  // Als de rekenkern al een kwaliteitspoort meegaf, is die tekstueel leidend (ze kent de
  // exacte drempels/steekproefgrootte) — we partitioneren de reasons per laag op trefwoord;
  // zonder poort vallen we terug op de ruwe metrics met dezelfde drempels als in fit.py.
  const samplerReasons: string[] = [];
  const fitReasons: string[] = [];
  if (gate && gate.reasons.length > 0) {
    for (const r of gate.reasons) (isSamplerReason(r) ? samplerReasons : fitReasons).push(r);
  } else {
    if (d.max_r_hat > 1.05) samplerReasons.push("De statistische schatting is nog niet volledig gestabiliseerd (hoge R-hat).");
    if (d.n_divergences > 0) samplerReasons.push(`De schatting liep ${d.n_divergences}× vast (divergenties).`);
    if (d.min_ess_bulk < 400) samplerReasons.push("Lage effectieve steekproefgrootte (ESS) — de posterior is ruizig geschat.");
    if (Math.abs(d.interval_coverage_94 - 0.94) > 0.1) fitReasons.push("De onzekerheidsmarges dekken de werkelijkheid niet goed af.");
    if (!d.decomposition_ok) fitReasons.push("De opbouw telt niet netjes op tot het totaal.");
    if (d.r2 < 0.5) fitReasons.push("Het model verklaart minder dan de helft van de schommelingen in de KPI.");
    if (d.mape > 0.2) fitReasons.push("De voorspelling zit gemiddeld meer dan 20% naast de werkelijke KPI.");
  }

  // De metrics zelf (niet het aggregaat-verdict van de poort) bepalen het niveau per laag
  // — zo telt een fail puur op R²/MAPE niet mee als "sampler zwak", en andersom. De
  // drempels spiegelen fit.py (_RHAT_FAIL=1.1, R²-fail-drempel 0.3).
  const samplerLevel: TrustLevel = d.max_r_hat > 1.1 ? "zwak" : samplerReasons.length > 0 ? "let_op" : "goed";
  const fitLevel: TrustLevel = !d.decomposition_ok || d.r2 < 0.3 ? "zwak" : fitReasons.length > 0 ? "let_op" : "goed";

  const sampler: TrustVerdict = { level: samplerLevel, headline: trustHeadline(samplerLevel, "sampler"), reasons: samplerReasons };
  const fit: TrustVerdict = { level: fitLevel, headline: trustHeadline(fitLevel, "fit"), reasons: fitReasons };
  return { sampler, fit, overall: worst(samplerLevel, fitLevel) };
}

// --- Vertrouwen per losse schatting (bandbreedte → label) ----------------------------

export type Confidence = "hoog" | "midden" | "laag";

// Hoe breed is de 94%-band rond de mediaan, relatief? Smal = we weten het redelijk zeker;
// breed = veel onzekerheid (typisch een data-arm kanaal). Dit vertaalt de p3–p97-band naar
// een label dat een marketeer zonder statistiek kan wegen.
export function confidenceFromInterval(iv: Interval): Confidence {
  const denom = Math.abs(iv.p50);
  if (denom < 1e-9) return "laag";
  const relHalfWidth = (iv.p97 - iv.p3) / (2 * denom);
  if (relHalfWidth < 0.4) return "hoog";
  if (relHalfWidth < 1.0) return "midden";
  return "laag";
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  hoog: "Hoog vertrouwen",
  midden: "Middel vertrouwen",
  laag: "Laag vertrouwen",
};

// --- Aanbevolen acties: van cijfers naar "doe dit" -----------------------------------

export type ActionKind = "shift" | "scale" | "cut" | "hold";

export interface RecommendedAction {
  kind: ActionKind;
  // De handeling in één zin, in de taal van een media manager.
  text: string;
  // Onderbouwing / verwacht effect.
  detail: string;
  confidence: Confidence;
}

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("nl-NL", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

// Lees de (al berekende) responscurve op een gegeven weekspend af (lineaire interpolatie,
// vlak afgekapt buiten het waargenomen bereik). Gedeeld met de scenarioplanner.
export function readCurveP50(curve: ResponseCurve, spend: number): number {
  const pts = [...curve.points].sort((a, b) => a.weekly_spend - b.weekly_spend);
  if (pts.length === 0) return 0;
  if (spend <= pts[0].weekly_spend) return pts[0].contribution.p50;
  const last = pts[pts.length - 1];
  if (spend >= last.weekly_spend) return last.contribution.p50;
  let i = pts.findIndex((p) => p.weekly_spend >= spend);
  if (i <= 0) i = 1;
  const a = pts[i - 1];
  const b = pts[i];
  const t = (spend - a.weekly_spend) / (b.weekly_spend - a.weekly_spend || 1);
  return a.contribution.p50 + t * (b.contribution.p50 - a.contribution.p50);
}

// Bouwt maximaal drie concrete, geprioriteerde adviezen uit de optimizer, de efficiency
// frontier en de ROAS-verdeling. Valt terug op ROAS-advies wanneer de budgetoptimalisatie
// ontbreekt (oudere runs). breakEven = 1/marge (of 1,0 zonder marge).
export function recommendedActions(summary: FitSummary, kpiMargin?: number | null): RecommendedAction[] {
  const kpi = summary.kpi;
  const actions: RecommendedAction[] = [];
  const curves = summary.response_curves ?? [];
  const alloc = summary.optimal_allocation;
  const breakEven = kpiMargin != null && kpiMargin > 0 ? 1 / kpiMargin : 1;

  // 1) Herverdeling bij gelijk budget (het krachtigste, gratis advies).
  if (alloc && curves.length > 0) {
    const byName = new Map(curves.map((c) => [c.name, c]));
    const currentTotal = curves.reduce((s, c) => s + readCurveP50(c, c.current_weekly_spend), 0);
    const gain = alloc.predicted_contribution.p50 - currentTotal;
    const deltas = Object.entries(alloc.per_channel)
      .map(([name, advised]) => ({ name, advised, current: byName.get(name)?.current_weekly_spend ?? 0 }))
      .map((d) => ({ ...d, delta: d.advised - d.current }));
    const up = [...deltas].sort((a, b) => b.delta - a.delta)[0];
    const down = [...deltas].sort((a, b) => a.delta - b.delta)[0];
    const meaningful = gain > Math.max(1, currentTotal * 0.02) && up && down && up.delta > 0 && down.delta < 0;
    if (meaningful) {
      const move = Math.min(up.delta, -down.delta);
      actions.push({
        kind: "shift",
        text: `Verschuif ± ${fmtNum(move)} per week van ${down.name} naar ${up.name}.`,
        detail: `Bij hetzelfde totale weekbudget levert de optimale verdeling naar schatting ${fmtNum(gain)} ${kpi} per week extra op (${fmtNum(alloc.predicted_contribution.p50)} vs. ${fmtNum(currentTotal)} nu).`,
        confidence: confidenceFromInterval(alloc.predicted_contribution),
      });
    } else {
      actions.push({
        kind: "hold",
        text: "Je huidige verdeling zit dicht bij het optimum — grote verschuivingen zijn niet nodig.",
        detail: `De optimale herverdeling zou bij gelijk budget hooguit ${fmtNum(Math.max(0, gain))} ${kpi} per week extra opleveren.`,
        confidence: confidenceFromInterval(alloc.predicted_contribution),
      });
    }
  }

  // 2) Meer of juist minder totaalbudget? Lees de frontier: loont opschalen nog?
  const frontier = [...(summary.efficiency_frontier ?? [])].sort((a, b) => a.total_weekly_budget - b.total_weekly_budget);
  const current = alloc?.total_weekly_budget ?? null;
  if (frontier.length >= 2 && current != null) {
    const nearest = (target: number) =>
      frontier.reduce((best, p) =>
        Math.abs(p.total_weekly_budget - target) < Math.abs(best.total_weekly_budget - target) ? p : best,
      );
    const base = nearest(current);
    const more = nearest(current * 1.3);
    if (more.total_weekly_budget > base.total_weekly_budget * 1.01) {
      const extraSpend = more.total_weekly_budget - base.total_weekly_budget;
      const extraKpi = more.predicted_contribution.p50 - base.predicted_contribution.p50;
      const returnRatio = extraSpend > 0 ? (extraKpi * (kpiMargin ?? 1)) / extraSpend : 0;
      const worth = kpiMargin != null ? returnRatio > 1 : extraKpi / Math.max(1, extraSpend) > breakEven;
      actions.push({
        kind: "scale",
        text: worth
          ? `Opschalen loont nog: ± ${fmtNum(extraSpend)} meer budget per week → ± ${fmtNum(extraKpi)} ${kpi} extra.`
          : `Verder opschalen loont nauwelijks: ± ${fmtNum(extraSpend)} extra levert nog maar ± ${fmtNum(extraKpi)} ${kpi} op.`,
        detail: "Daarna vlakt het rendement af — zie de curve 'Totaalbudget vs. verwachte opbrengst'.",
        confidence: confidenceFromInterval(more.predicted_contribution),
      });
    }
  }

  // 3) Vrijwel zekere verliesgevers afbouwen (ROAS-band volledig onder break-even).
  const losers = summary.channels.filter((ch) => ch.roas.p97 <= breakEven && ch.total_spend > 0);
  if (losers.length > 0) {
    const names = losers.map((c) => c.name).join(", ");
    actions.push({
      kind: "cut",
      text: `Herzie of verlaag ${names} — ${losers.length > 1 ? "deze kanalen verdienen" : "dit kanaal verdient"} zichzelf vrijwel zeker niet terug.`,
      detail:
        kpiMargin != null
          ? `De ROAS ligt met grote zekerheid onder de break-even van ${fmtNum(breakEven, 2)} (bij €${fmtNum(kpiMargin, 2)} marge per eenheid).`
          : "De ROAS ligt met grote zekerheid onder 1,0 — let op: de échte break-even hangt van je marge af.",
      confidence: "hoog",
    });
  }

  return actions.slice(0, 4);
}
