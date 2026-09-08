import { CHANNELS, EFFECT_STEPS, SPEND_STEPS, STEP_ON_DARK, shiftedSpendShares } from "@/lib/site/exampleData";
import type { BarSegment } from "./BudgetBar";

/** De budgetverdeling: neutrale stappen. */
export function spendSegments(): BarSegment[] {
  return CHANNELS.map((channel, i) => ({
    key: channel.key,
    label: channel.label,
    pct: channel.spendShare,
    color: SPEND_STEPS[i],
    onDark: STEP_ON_DARK[i],
  }));
}

/** De geschatte bijdrage: dezelfde volgorde, blauwe stappen, vertrekkend vanaf het budget. */
export function effectSegments(): BarSegment[] {
  return CHANNELS.map((channel, i) => ({
    key: channel.key,
    label: channel.label,
    pct: channel.effectShare,
    fromPct: channel.spendShare,
    color: EFFECT_STEPS[i],
    onDark: STEP_ON_DARK[i],
  }));
}

/** Een alternatieve budgetverdeling, voor de scenario-vergelijking. */
export function shiftedSpendSegments(shiftPct: number): BarSegment[] {
  const shares = shiftedSpendShares(shiftPct);
  return CHANNELS.map((channel, i) => ({
    key: channel.key,
    label: channel.label,
    pct: shares[i],
    color: SPEND_STEPS[i],
    onDark: STEP_ON_DARK[i],
  }));
}

export const legendItems = CHANNELS.map((channel, i) => ({
  key: channel.key,
  label: channel.label,
  spendColor: SPEND_STEPS[i],
  effectColor: EFFECT_STEPS[i],
}));

/** Tekstversie van een balk, voor schermlezers. */
export function shareSentence(prefix: string, segs: { label: string; pct: number }[]): string {
  return `${prefix}: ${segs.map((seg) => `${seg.label} ${Math.round(seg.pct)}%`).join(", ")}.`;
}

/** Cumulatieve grenzen (exclusief 0 en 100) — de aanknopingspunten voor de verbindingslijnen. */
export function boundaries(values: number[]): number[] {
  const result: number[] = [];
  let running = 0;
  for (let i = 0; i < values.length - 1; i += 1) {
    running += values[i];
    result.push(running);
  }
  return result;
}
