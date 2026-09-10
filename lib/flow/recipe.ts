// Van bevestigde kolommen plus gemaakte keuzes naar een samenvoegrecept.
//
// Dit is de enige plek waar de keuzes uit stap 4 een technische vorm krijgen. De vertaling
// is bewust smal: alleen wat `mmm_core.ingestion` daadwerkelijk accepteert komt erin, en wat
// er niet in past wordt hier geweigerd in plaats van pas in de worker te struikelen.

import type { ColumnMapping, ColumnRole, DatasetRecipe, FillStrategy, SourceFile } from "@/lib/types";

/** Welke keuze de gebruiker per bevinding heeft gemaakt: bevindings-id → keuze-id. */
export type FindingChoices = Record<string, string>;

/** Wat de gebruiker bij een keuze heeft getypt: bevindings-id → toelichting. */
export type FindingNotes = Record<string, string>;

/**
 * Een week die de gebruiker zelf aanwijst als bijzonder, los van de detectie.
 *
 * Zonder dit kan een week alleen apart worden gezet als de uitschieter-detectie hem al had
 * opgemerkt én aangeboden. Dat gaat mis bij precies het geval waar het het meest toe doet:
 * een actie die elk jaar terugkeert. Vier Black Fridays op rij lijken onderling normaal, dus
 * de z-score blijft laag en de week verschijnt nooit als keuze — terwijl de gebruiker
 * dondersgoed weet dat hij er was. Wie de datum noemt, moet hem kwijt kunnen.
 */
export interface DeclaredEvent {
  /** Een datum in die week; de ISO-week eromheen wordt de dummy. */
  date: string;
  /** Waarom die week bijzonder was ("Black Friday"). Wordt de kolomnaam. */
  note?: string;
}

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

/**
 * Van getypte toelichting naar kolomnaam: "Black Friday-actie!" → "black_friday_actie".
 *
 * De naam belandt als kolom in de weektabel en straks in het kwaliteitsrapport, dus hij moet
 * saai zijn: kleine letters, cijfers en liggende streepjes. Levert de tekst niets bruikbaars
 * op (alleen leestekens, of een andere schriftsoort), dan is de uitkomst leeg en valt de
 * aanroeper terug op de neutrale naam — nooit een half kapotte kolomnaam.
 */
export function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .filter(Boolean)
    .slice(0, 4)
    .join("_")
    .slice(0, 40);
}

/** Dezelfde naam twee keer bestaat niet in een tabel; hier wordt dat opgelost, niet gemeld. */
function uniqueName(candidate: string, taken: Set<string>): string {
  if (!taken.has(candidate)) return candidate;
  for (let i = 2; i < 100; i++) {
    const next = `${candidate}_${i}`;
    if (!taken.has(next)) return next;
  }
  return `${candidate}_${Date.now()}`;
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
 *    zodat die week niet aan marketing wordt toegeschreven. De toelichting die de gebruiker
 *    erbij typte ("Black Friday") wordt de naam van die kolom én blijft als tekst bij het
 *    recept staan — anders overleeft de reden nergens.
 *  - `duplicate:<a>:<b>` met "drop_a"/"drop_b" → die kolom gaat niet mee.
 */
export function buildRecipe(
  source: SourceFile,
  mapping: ColumnMapping | null,
  choices: FindingChoices,
  notes: FindingNotes = {},
  declaredEvents: DeclaredEvent[] = [],
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
  // dezelfde week niet twee identieke kolommen opleveren. De toelichtingen van zulke
  // samengevoegde pieken worden allebei bewaard — er is er niet één "de juiste".
  const eventWeeks = new Map<string, { week: [number, number]; notes: string[] }>();
  const markWeek = (label: string, note: string | undefined) => {
    const date = new Date(label);
    if (Number.isNaN(date.getTime())) return;
    const week = isoWeek(date);
    const key = `${week[0]}-${week[1]}`;
    const entry = eventWeeks.get(key) ?? { week, notes: [] };
    const text = note?.trim();
    if (text && !entry.notes.includes(text)) entry.notes.push(text);
    eventWeeks.set(key, entry);
  };

  for (const [findingId, choice] of Object.entries(choices)) {
    if (choice !== "event" || !findingId.startsWith("outlier:")) continue;
    markWeek(findingId.split(":").slice(2).join(":"), notes[findingId]);
  }
  // Weken die de gebruiker zelf aanwees. Ze lopen door dezelfde `markWeek`, dus een week die
  // óók als uitschieter was aangeboden levert één dummy op in plaats van twee.
  for (const event of declaredEvents) markWeek(event.date, event.note);

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
    // De kolomnamen die er al zijn: een event-dummy die er eentje overschrijft, laat
    // mmm_core.ingestion terecht struikelen (`event_dummy_name_collision`).
    const taken = new Set<string>(entries.map((e) => e.name));
    recipe.event_dummies = Array.from(eventWeeks.values()).map(({ week, notes: reasons }) => {
      const suffix = `${week[0]}_${String(week[1]).padStart(2, "0")}`;
      const name = uniqueName(`${slug(reasons[0] ?? "") || "bijzondere_week"}_${suffix}`, taken);
      taken.add(name);
      return {
        name,
        weeks: [week] as [number, number][],
        ...(reasons.length > 0 ? { note: reasons.join(" / ") } : {}),
      };
    });
  }

  return { recipe, problem: null };
}
