// Van bevestigde kolommen plus gemaakte keuzes naar een samenvoegrecept.
//
// Dit is de enige plek waar de keuzes uit stap 4 een technische vorm krijgen. De vertaling
// is bewust smal: alleen wat `mmm_core.ingestion` daadwerkelijk accepteert komt erin, en wat
// er niet in past wordt hier geweigerd in plaats van pas in de worker te struikelen.

import type { ColumnMapping, ColumnRole, DatasetRecipe, FillStrategy, SourceFile } from "@/lib/types";

/** Welke keuze de gebruiker per bevinding heeft gemaakt: bevindings-id → keuze-id. */
export type FindingChoices = Record<string, string>;

const FILL_STRATEGIES = new Set<string>(["zero", "ffill", "bfill", "interpolate", "mean", "median"]);

/**
 * ISO-jaar en -weeknummer van een datum.
 *
 * `event_dummies` noemt weken als [ISO-jaar, weeknummer], en het ISO-jaar is niet altijd het
 * kalenderjaar: 30 december 2025 valt in ISO-week 1 van 2026. Dat verschil van één regel is
 * precies het soort fout dat een event-dummy stilletjes op de verkeerde week zet.
 */
export function isoWeek(date: Date): [number, number] {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Donderdag van deze week bepaalt het ISO-jaar.
  const dayNumber = (d.getUTCDay() + 6) % 7; // maandag = 0
  d.setUTCDate(d.getUTCDate() - dayNumber + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return [isoYear, week];
}

export interface RecipeResult {
  recipe: DatasetRecipe | null;
  /** Waarom het niet kan, in mensentaal. Null als het wel kan. */
  problem: string | null;
}

/**
 * Bouw het recept.
 *
 * Wat de keuzes doen:
 *  - `gap:<kolom>` met een fill-strategie → `fill` op die control-kolom (alleen controls; de
 *    rekenkern weigert het op een andere rol).
 *  - `outlier:<kolom>:<datum>` met "event" → een event-dummy op de ISO-week van die datum,
 *    zodat die week niet aan marketing wordt toegeschreven.
 *  - `duplicate:<a>:<b>` met "drop_a"/"drop_b" → die kolom gaat niet mee.
 */
export function buildRecipe(
  source: SourceFile,
  mapping: ColumnMapping | null,
  choices: FindingChoices,
): RecipeResult {
  const entries = mapping?.columns ?? [];
  const dateColumn = entries.find((c) => c.role === "date")?.name;
  const kpiColumn = entries.find((c) => c.role === "kpi")?.name;

  if (!dateColumn) return { recipe: null, problem: "Ik weet niet welke kolom de datum is." };
  if (!kpiColumn) return { recipe: null, problem: "Ik weet niet welke kolom je resultaat is." };

  // Kolommen die de gebruiker heeft laten vallen omdat ze te veel op een andere leken.
  const dropped = new Set<string>();
  for (const [findingId, choice] of Object.entries(choices)) {
    if (!findingId.startsWith("duplicate:")) continue;
    const [, a, b] = findingId.split(":");
    if (choice === "drop_a") dropped.add(a);
    if (choice === "drop_b") dropped.add(b);
  }

  const fillOf = (name: string): FillStrategy | undefined => {
    const choice = choices[`gap:${name}`];
    return choice && FILL_STRATEGIES.has(choice) ? (choice as FillStrategy) : undefined;
  };

  const columns: DatasetRecipe["sources"][number]["columns"] = [];
  for (const entry of entries) {
    if (entry.role !== "kpi" && entry.role !== "spend" && entry.role !== "control") continue;
    if (dropped.has(entry.name)) continue;
    columns.push({
      name: entry.name,
      role: entry.role as ColumnRole,
      // `fill` is alleen voor controls — spec.py weigert het op een andere rol, en die fout
      // zou pas in de worker zichtbaar worden.
      ...(entry.role === "control" && fillOf(entry.name) ? { fill: fillOf(entry.name) } : {}),
    });
  }

  const spendCount = columns.filter((c) => c.role === "spend").length;
  if (spendCount === 0) {
    return {
      recipe: null,
      problem: dropped.size > 0
        ? "Er blijft geen enkel kanaal over — je hebt ze allemaal laten vallen."
        : "Ik zie geen enkele kanaalkolom.",
    };
  }

  // Bijzondere weken: één dummy per gemarkeerde week, samengevoegd zodat twee pieken in
  // dezelfde week niet twee identieke kolommen opleveren.
  const eventWeeks = new Map<string, [number, number]>();
  for (const [findingId, choice] of Object.entries(choices)) {
    if (choice !== "event" || !findingId.startsWith("outlier:")) continue;
    const label = findingId.split(":").slice(2).join(":");
    const date = new Date(label);
    if (Number.isNaN(date.getTime())) continue;
    const week = isoWeek(date);
    eventWeeks.set(`${week[0]}-${week[1]}`, week);
  }

  const recipe: DatasetRecipe = {
    sources: [
      {
        // Het bestand wordt bij zijn RIJ-ID genoemd, nooit bij een opslagpad: de server leidt
        // het pad af uit de rijen van dít project.
        source_file_id: source.id,
        name: source.name.replace(/\.[^.]+$/, ""),
        date_column: dateColumn,
        columns,
      },
    ],
  };
  if (eventWeeks.size > 0) {
    recipe.event_dummies = Array.from(eventWeeks.values()).map((week) => ({
      name: `bijzondere_week_${week[0]}_${String(week[1]).padStart(2, "0")}`,
      weeks: [week],
    }));
  }

  return { recipe, problem: null };
}
