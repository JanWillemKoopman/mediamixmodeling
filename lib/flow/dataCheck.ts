// Wat de gebruiker over zijn eigen bestand te horen krijgt, vóórdat er iets draait.
//
// Twee dingen, allebei deterministisch en allebei in gewone taal:
//   1. `checkSource` — kan hier überhaupt een model op? Dat oordeel hoorde de gebruiker
//      vroeger pas twee stappen verderop, als het samenvoegen struikelde.
//   2. `analyseProfile` — wat is er aan deze data opvallend, en welke keuze hoort daarbij.
//
// GEEN statistiek. Dit is een leesbaarheidscontrole op het profiel dat bij de upload is
// gemaakt (lib/dataProfile.ts): telt het aantal weken, staat er een datumkolom in, zijn er
// genoeg getalkolommen. De echte beoordeling blijft waar hij hoort — `validate_columns` en
// de kwaliteitscontrole in mmm-core, met de worker als scheidsrechter. Wat hier staat mag
// nooit een reden zijn om die over te slaan; het bespaart de gebruiker alleen het wachten
// op een oordeel dat je aan de voordeur al kunt geven.

import type { ColumnMapping, ProfileColumnStats, SourceProfile } from "@/lib/types";

export type SourceVerdict = "usable" | "usable_with_warnings" | "not_usable";

export interface SourceCheck {
  verdict: SourceVerdict;
  headline: string;
  /** Wat er goed is en wat niet — elk punt in één regel. */
  points: { tone: "ok" | "warn" | "blocking"; text: string }[];
}

/** Hoeveel weken beslaat de reeks? Losstaand van dag- of weekregels. */
export function weeksCovered(profile: SourceProfile): number | null {
  const range = profile.date_range;
  if (!range) return null;
  const start = new Date(range[0]).getTime();
  const end = new Date(range[1]).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / (7 * 24 * 3600 * 1000));
}

// Onder deze grens valt er niets zinnigs te schatten: een model dat na-ijl, verzadiging en
// seizoen uit elkaar moet halen heeft simpelweg meer weken nodig dan het parameters heeft.
const MIN_WEEKS = 26;
const COMFORTABLE_WEEKS = 52;

export function checkSource(profile: SourceProfile | null): SourceCheck {
  if (!profile) {
    return {
      verdict: "not_usable",
      headline: "Ik kan dit bestand niet lezen.",
      points: [
        {
          tone: "blocking",
          text: "Het lukte niet om er rijen en kolommen uit te halen. Is het een CSV met een kopregel?",
        },
      ],
    };
  }

  const points: SourceCheck["points"] = [];
  let blocking = 0;
  let warnings = 0;

  const numeric = profile.columns.filter((c) => c.kind === "numeric");

  if (!profile.date_column) {
    points.push({ tone: "blocking", text: "Ik vind geen datumkolom. Zonder datum kan ik geen weken maken." });
    blocking++;
  } else {
    points.push({ tone: "ok", text: `Datumkolom gevonden: ${profile.date_column}.` });
  }

  const weeks = weeksCovered(profile);
  if (weeks == null) {
    if (profile.date_column) {
      points.push({ tone: "warn", text: "Ik kan de periode niet goed lezen — controleer het datumformaat." });
      warnings++;
    }
  } else if (weeks < MIN_WEEKS) {
    points.push({
      tone: "blocking",
      text: `Je reeks beslaat ${weeks} weken. Onder de ${MIN_WEEKS} weken valt er niets betrouwbaars te schatten.`,
    });
    blocking++;
  } else if (weeks < COMFORTABLE_WEEKS) {
    points.push({
      tone: "warn",
      text: `Je reeks beslaat ${weeks} weken. Dat kan, maar met minder dan een jaar wordt de uitkomst onzekerder — en dat zeg ik straks ook.`,
    });
    warnings++;
  } else {
    points.push({ tone: "ok", text: `${weeks} weken aan data — ruim genoeg.` });
  }

  if (numeric.length < 2) {
    points.push({
      tone: "blocking",
      text: "Ik zie niet genoeg getalkolommen. Er moet minstens één resultaatkolom zijn en één kolom per kanaal.",
    });
    blocking++;
  } else {
    points.push({ tone: "ok", text: `${numeric.length} getalkolommen om uit te kiezen.` });
  }

  const verdict: SourceVerdict = blocking > 0 ? "not_usable" : warnings > 0 ? "usable_with_warnings" : "usable";
  const headline =
    verdict === "not_usable"
      ? "Hier kan ik nog geen model op bouwen."
      : verdict === "usable_with_warnings"
        ? "Dit kan, met een kanttekening."
        : "Dit ziet er goed uit.";

  return { verdict, headline, points };
}

// --- bevindingen voor stap 4 -----------------------------------------------------------

export interface FindingChoice {
  id: string;
  label: string;
  /** Wat deze keuze doet, in één regel — zodat een keuze nooit een gok is. */
  effect: string;
  /**
   * Verandert deze keuze de data die straks het model in gaat?
   *
   * Stap 4 legt vragen voor, geen instellingen — maar de gebruiker mag nooit hoeven raden
   * welke van zijn antwoorden dóórwerken. De kaart telt hiermee hoeveel van de vragen zijn
   * data veranderen, en zet het per vraag erbij.
   */
  changesData: boolean;
  /**
   * Vraagt deze keuze om een korte toelichting?
   *
   * "Er speelde iets bijzonders" zonder te kunnen zeggen wát er speelde, is een halve
   * mededeling: de week wordt apart gezet, maar niemand — de gebruiker zelf over drie
   * maanden, de gids in het gesprek, de collega die het rapport leest — kan later nog
   * nagaan waarom. De tekst wordt de naam van de bijzondere week (lib/flow/recipe.ts) en
   * gaat mee het gesprek in.
   */
  note?: { label: string; placeholder: string };
}

const KEEP: FindingChoice = {
  id: "keep",
  label: "Laat staan",
  effect: "Ik verander niets aan deze cijfers.",
  changesData: false,
};

/** Eén reeks uit het bestand, klaar om te tekenen. */
export interface FindingSeries {
  name: string;
  /** Uitgelijnd op `FindingEvidence.labels`; null waar de cel leeg was. */
  values: (number | null)[];
}

/** Het stuk van de reeks waar de vraag over gaat. */
export interface FindingMark {
  /** Index in `FindingEvidence.labels`, beide inclusief. */
  from: number;
  to: number;
  tone: "gap" | "peak";
}

/** Eén regel uit de weektabel achter een bevinding. */
export interface FindingRow {
  label: string;
  /** Eén waarde per reeks, in dezelfde volgorde als `FindingEvidence.series`. */
  values: (number | null)[];
  /** Hoort deze week bij het gat of de piek zelf? */
  highlight: boolean;
}

/**
 * Waarop een bevinding berust — zodat de gebruiker haar zélf kan nakijken.
 *
 * Dit is het verschil tussen "2026-11-23 springt eruit: 28.298" en een vraag die te
 * beantwoorden is. Een marketeer kent zijn eigen weken niet uit zijn hoofd; hij kan pas
 * zeggen of daar iets speelde als hij ziet wat normaal is, welke weken het precies betreft
 * en wat de weken eromheen deden.
 *
 * Alles hier komt uit het profiel dat bij de upload is gemaakt. Er wordt niets bijgeschat en
 * niets afgerond wat de betekenis verandert; ontbreekt de reeks (een oud profiel, een heel
 * groot bestand), dan blijven `labels`/`series` leeg en vervalt alleen de grafiek.
 */
export interface FindingEvidence {
  /** De x-as: één label per rij in het bestand. Leeg als het profiel geen reeks draagt. */
  labels: string[];
  series: FindingSeries[];
  marks: FindingMark[];
  /** Harde feiten uit de reeks, in gewone taal. */
  facts: string[];
  /** De weken waar het om gaat, met de weken eromheen. */
  rows: FindingRow[];
}

export interface DataFinding {
  id: string;
  kind: "gap" | "outlier" | "duplicate";
  /** Waar deze vraag over gaat, in twee woorden — voor het label boven de vraag. */
  topic: string;
  headline: string;
  detail: string;
  choices: FindingChoice[];
  defaultChoice: string;
  /** Waarop de vraag berust. Null als het profiel er te weinig voor draagt. */
  evidence: FindingEvidence | null;
}

export interface ProfileAnalysis {
  /** Punten waar de gebruiker iets over moet beslissen. */
  findings: DataFinding[];
  /** Punten die hij moet wéten, maar waar niets te kiezen valt. */
  notes: string[];
}

// --- het bewijsmateriaal ---------------------------------------------------------------

/** Een getal zoals een mens het leest: geen nepprecisie, wel het verschil zichtbaar. */
export function formatValue(value: number): string {
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 1 ? 1 : 2;
  return value.toLocaleString("nl-NL", { maximumFractionDigits: decimals });
}

function seriesOf(profile: SourceProfile, name: string): (number | null)[] | null {
  const column = profile.columns.find((c) => c.name === name);
  const values = column?.series;
  if (!values || !profile.labels || values.length !== profile.labels.length) return null;
  return values;
}

/** De rijen rond een stuk van de reeks — de piek of het gat, met zijn buren erbij. */
function rowsAround(
  labels: string[],
  series: FindingSeries[],
  from: number,
  to: number,
  padding: number,
): FindingRow[] {
  const start = Math.max(0, from - padding);
  const end = Math.min(labels.length - 1, to + padding);
  const rows: FindingRow[] = [];
  for (let i = start; i <= end; i++) {
    rows.push({
      label: labels[i],
      values: series.map((s) => s.values[i] ?? null),
      highlight: i >= from && i <= to,
    });
  }
  return rows;
}

/** De laatste bekende waarde vóór index `i`, met zijn label. */
function neighbourBefore(labels: string[], values: (number | null)[], i: number) {
  for (let j = i - 1; j >= 0; j--) if (values[j] != null) return { label: labels[j], value: values[j]! };
  return null;
}

function neighbourAfter(labels: string[], values: (number | null)[], i: number) {
  for (let j = i + 1; j < values.length; j++) if (values[j] != null) return { label: labels[j], value: values[j]! };
  return null;
}

/**
 * Dezelfde periode een jaar eerder.
 *
 * Precies het feit dat de vraag "speelde daar iets bijzonders?" beantwoordbaar maakt: een
 * piek die vorig jaar in dezelfde week óók stond, is geen incident maar iets terugkerends
 * (Black Friday, de feestdagen) — en dat verandert het antwoord. Werkt alleen op labels die
 * als datum te lezen zijn; anders geen bewering.
 */
function sameWeekYearEarlier(
  labels: string[],
  values: (number | null)[],
  i: number,
): { label: string; value: number } | null {
  const at = Date.parse(labels[i]);
  if (!Number.isFinite(at)) return null;
  const target = at - 364 * 24 * 3600 * 1000;
  const tolerance = 10 * 24 * 3600 * 1000;
  let best: { label: string; value: number; distance: number } | null = null;
  for (let j = 0; j < i; j++) {
    if (values[j] == null) continue;
    const other = Date.parse(labels[j]);
    if (!Number.isFinite(other)) continue;
    const distance = Math.abs(other - target);
    if (distance > tolerance) continue;
    if (!best || distance < best.distance) best = { label: labels[j], value: values[j]!, distance };
  }
  return best ? { label: best.label, value: best.value } : null;
}

/** Hoe vaak twee reeksen dezelfde kant op bewegen — correlatie, maar dan te navertellen. */
function stepsTogether(a: (number | null)[], b: (number | null)[]): { same: number; total: number } {
  let same = 0;
  let total = 0;
  let previous: { a: number; b: number } | null = null;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    if (va == null || vb == null) continue;
    if (previous) {
      const da = va - previous.a;
      const db = vb - previous.b;
      if (da !== 0 || db !== 0) {
        total++;
        if (da >= 0 === db >= 0) same++;
      }
    }
    previous = { a: va, b: vb };
  }
  return { same, total };
}

/** Waarop de gat-vraag berust: welke weken precies, en wat de buren doen. */
function gapEvidence(profile: SourceProfile, column: ProfileColumnStats): FindingEvidence {
  const runs = (column.missing_runs ?? []).filter((r) => r.length > 0);
  const facts: string[] = [];

  if (runs.length > 0) {
    const described = runs
      .slice(0, 3)
      .map((r) => (r.length === 1 ? r.start_label : `${r.start_label} t/m ${r.end_label} (${r.length} weken)`));
    const rest = runs.length - described.length;
    facts.push(
      `Het gaat om: ${described.join(", ")}${rest > 0 ? ` en nog ${rest} ${rest === 1 ? "gat" : "gaten"}` : ""}.`,
    );
  }
  facts.push(
    `In totaal heeft "${column.name}" in ${column.n_missing} van de ${profile.n_rows} rijen geen waarde.`,
  );
  if (column.min != null && column.max != null && column.p50 != null) {
    facts.push(
      `Waar wél een waarde staat, ligt die tussen ${formatValue(column.min)} en ${formatValue(column.max)} — meestal rond ${formatValue(column.p50)}.`,
    );
  }

  const values = seriesOf(profile, column.name);
  const labels = profile.labels ?? [];
  if (!values) return { labels: [], series: [], marks: [], facts, rows: [] };

  const series: FindingSeries[] = [{ name: column.name, values }];
  const longest = runs.reduce<typeof runs[number] | null>(
    (best, run) => (best == null || run.length > best.length ? run : best),
    null,
  );
  const marks: FindingMark[] = runs.map((run) => ({
    from: run.start,
    to: run.start + run.length - 1,
    tone: "gap",
  }));
  let rows: FindingRow[] = [];
  if (longest) {
    const before = neighbourBefore(labels, values, longest.start);
    const after = neighbourAfter(labels, values, longest.start + longest.length - 1);
    if (before && after) {
      facts.push(
        `Vlak vóór het gat stond er ${formatValue(before.value)} (${before.label}), vlak erna ${formatValue(after.value)} (${after.label}).`,
      );
    } else if (before) {
      facts.push(`De laatste waarde vóór het gat was ${formatValue(before.value)} (${before.label}).`);
    } else if (after) {
      facts.push(`Het gat valt aan het begin van je reeks; de eerste waarde erna is ${formatValue(after.value)} (${after.label}).`);
    }
    rows = rowsAround(labels, series, longest.start, longest.start + longest.length - 1, 3);
  }
  return { labels, series, marks, facts, rows };
}

/** Waarop de piek-vraag berust: hoe ver van normaal, wat de buren deden, en vorig jaar. */
function outlierEvidence(
  profile: SourceProfile,
  column: ProfileColumnStats,
  outlier: { label: string; value: number; z: number },
): FindingEvidence {
  const facts: string[] = [];
  const typical = column.p50 ?? column.mean;
  if (typical != null && typical !== 0) {
    const factor = outlier.value / typical;
    facts.push(
      `Deze week: ${formatValue(outlier.value)}. Een gewone week ligt rond ${formatValue(typical)} — dit is ${formatValue(Math.abs(factor))}× zo ${factor >= 1 ? "hoog" : "laag"}.`,
    );
  } else {
    facts.push(`Deze week: ${formatValue(outlier.value)}.`);
  }

  const values = seriesOf(profile, column.name);
  const labels = profile.labels ?? [];
  const index = values ? labels.indexOf(outlier.label) : -1;
  if (!values || index < 0) return { labels: [], series: [], marks: [], facts, rows: [] };

  const series: FindingSeries[] = [{ name: column.name, values }];
  const before = neighbourBefore(labels, values, index);
  const after = neighbourAfter(labels, values, index);
  if (before || after) {
    const parts = [
      before ? `ervóór ${formatValue(before.value)} (${before.label})` : null,
      after ? `erna ${formatValue(after.value)} (${after.label})` : null,
    ].filter(Boolean);
    facts.push(`De weken eromheen: ${parts.join(", ")}.`);
  }

  const lastYear = sameWeekYearEarlier(labels, values, index);
  if (lastYear) {
    const comparable = outlier.value !== 0 && Math.abs(lastYear.value - outlier.value) / Math.abs(outlier.value) < 0.25;
    facts.push(
      `Een jaar eerder stond er in dezelfde periode ${formatValue(lastYear.value)} (${lastYear.label})${comparable ? " — vergelijkbaar met deze week, dus mogelijk iets dat elk jaar terugkomt" : ""}.`,
    );
  }

  const known = values.filter((v): v is number => v != null);
  const rank = known.filter((v) => v > outlier.value).length + 1;
  facts.push(
    rank === 1
      ? `Dit is de hoogste week van alle ${known.length} weken in je bestand.`
      : `Van de ${known.length} weken in je bestand staan er ${rank - 1} hoger.`,
  );

  return {
    labels,
    series,
    marks: [{ from: index, to: index, tone: "peak" }],
    facts,
    rows: rowsAround(labels, series, index, index, 3),
  };
}

/** Waarop de "lijken te veel op elkaar"-vraag berust: hoe vaak ze samen bewegen. */
function duplicateEvidence(
  profile: SourceProfile,
  a: string,
  b: string,
  r: number,
): FindingEvidence {
  const facts: string[] = [`Ze bewegen bijna één-op-één mee (samenhang ${r.toFixed(2)} van de 1,00).`];
  const valuesA = seriesOf(profile, a);
  const valuesB = seriesOf(profile, b);
  const labels = profile.labels ?? [];
  if (!valuesA || !valuesB) return { labels: [], series: [], marks: [], facts, rows: [] };

  const together = stepsTogether(valuesA, valuesB);
  if (together.total > 0) {
    facts.push(
      `In ${together.same} van de ${together.total} weken gaan ze samen omhoog of samen omlaag.`,
    );
  }
  for (const name of [a, b]) {
    const column = profile.columns.find((c) => c.name === name);
    if (column?.min != null && column.max != null) {
      facts.push(`"${name}" loopt van ${formatValue(column.min)} tot ${formatValue(column.max)}.`);
    }
  }

  return {
    labels,
    series: [
      { name: a, values: valuesA },
      { name: b, values: valuesB },
    ],
    marks: [],
    facts,
    rows: [],
  };
}

/**
 * De opvallende dingen in het profiel, vertaald naar vragen met keuzes.
 *
 * Er wordt hier alleen iets voorgelegd wat de rekenkern ook echt kan uitvoeren. Dat is geen
 * detail: een keuzemenu dat iets belooft wat de motor niet kent, is precies de soort belofte
 * die de oude wizard deed. Concreet volgt dit `mmm_core.ingestion`:
 *   * ontbrekende kanaalweken wórden binnen het venster al als nul gelezen — daar valt niets
 *     te kiezen, dus dat is een mededeling;
 *   * `fill` bestaat alleen voor controls (spec.py weigert het op een andere rol);
 *   * gaten in de KPI worden gemeld en nooit stilzwijgend opgevuld — ook een mededeling.
 *
 * Elke vraag draagt zijn bewijsmateriaal mee (`evidence`): de reeks, de weken die het
 * betreft, en een paar feiten in gewone taal. Zonder dat is "2026-11-23 springt eruit"
 * een bewering waar de gebruiker niets mee kan — hij kent zijn weken niet uit zijn hoofd.
 *
 * Bewust een korte lijst: elk punt kost aandacht, en een lijst van dertig meldingen leest
 * niemand.
 */
export function analyseProfile(
  profile: SourceProfile | null,
  mapping: ColumnMapping | null,
): ProfileAnalysis {
  if (!profile) return { findings: [], notes: [] };
  const roleOf = new Map((mapping?.columns ?? []).map((c) => [c.name, c.role]));
  const modelled = (name: string) => {
    const role = roleOf.get(name);
    return role === "kpi" || role === "spend" || role === "control";
  };

  const findings: DataFinding[] = [];
  const notes: string[] = [];

  for (const col of profile.columns) {
    if (!modelled(col.name) || col.longest_missing_run < 2) continue;
    const role = roleOf.get(col.name);

    if (role === "spend") {
      notes.push(
        `"${col.name}" heeft ${col.longest_missing_run} weken achter elkaar geen waarde. Die lees ik als nul — geen uitgave.`,
      );
      continue;
    }
    if (role === "kpi") {
      notes.push(
        `"${col.name}" mist ${col.longest_missing_run} weken achter elkaar. Je resultaat verzin ik niet: die weken blijven leeg en je ziet ze terug in het kwaliteitsrapport.`,
      );
      continue;
    }

    // Alleen bij een control valt er iets te kiezen — daar kent de rekenkern een fill voor.
    findings.push({
      id: `gap:${col.name}`,
      kind: "gap",
      topic: "Ontbrekende weken",
      headline: `"${col.name}" heeft ${col.longest_missing_run} weken achter elkaar geen waarde.`,
      detail: "Wat moet ik met die weken doen?",
      choices: [
        { id: "ffill", label: "Neem de vorige waarde over", effect: "Ik vul de gaten met de laatst bekende waarde.", changesData: true },
        { id: "zero", label: "Lees ze als nul", effect: "Ik zet die weken op nul.", changesData: true },
        { id: "interpolate", label: "Loop er vloeiend doorheen", effect: "Ik trek een rechte lijn tussen de bekende waarden.", changesData: true },
        KEEP,
      ],
      defaultChoice: "ffill",
      evidence: gapEvidence(profile, col),
    });
  }

  // Uitschieters: alleen op de KPI. Een piek in een kanaal is meestal gewoon een campagne;
  // een piek in het resultaat is iets wat het model anders aan je marketing toeschrijft.
  for (const col of profile.columns) {
    if (roleOf.get(col.name) !== "kpi") continue;
    for (const outlier of col.outliers.slice(0, 3)) {
      findings.push({
        id: `outlier:${col.name}:${outlier.label}`,
        kind: "outlier",
        topic: "Week die eruit springt",
        headline: `${outlier.label} springt eruit: ${outlier.value.toLocaleString("nl-NL")}.`,
        detail:
          "Speelde daar iets bijzonders — een actie, een storing, een feestdag? Dan zet ik die week apart. " +
          "Doe ik dat niet, dan schrijft het model die piek toe aan je marketing.",
        choices: [
          {
            id: "event",
            label: "Er speelde iets bijzonders",
            effect: "Ik zet die week apart, zodat hij je kanaalcijfers niet vertekent.",
            changesData: true,
            note: {
              label: "Wat speelde er die week?",
              placeholder: "Black Friday, storing in de webshop, extra folder…",
            },
          },
          KEEP,
        ],
        defaultChoice: "keep",
        evidence: outlierEvidence(profile, col, outlier),
      });
    }
  }

  // Kanalen die te veel op elkaar lijken: het model kan ze niet los schatten, en dat wordt
  // later een onscheidbaar paar in het oordeel. Beter hier één keuze dan daar een verrassing.
  for (const pair of profile.high_correlations) {
    if (Math.abs(pair.r) < 0.9) continue;
    if (!modelled(pair.a) || !modelled(pair.b)) continue;

    // Is er één van de twee een hulpkolom en de ander een kanaal, dan is de hulpkolom de
    // kandidaat om te laten vallen — een kanaal weggooien kost je een kanaal. Die voorkeur
    // staat in de ORDE van de keuzes, niet in een stille standaard: de gebruiker beslist.
    const aIsChannel = roleOf.get(pair.a) === "spend";
    const bIsChannel = roleOf.get(pair.b) === "spend";
    const first = aIsChannel && !bIsChannel ? pair.b : bIsChannel && !aIsChannel ? pair.a : pair.b;
    const second = first === pair.b ? pair.a : pair.b;
    const dropId = (name: string) => (name === pair.a ? "drop_a" : "drop_b");

    findings.push({
      id: `duplicate:${pair.a}:${pair.b}`,
      kind: "duplicate",
      topic: "Kolommen die op elkaar lijken",
      headline: `"${pair.a}" en "${pair.b}" bewegen bijna identiek mee.`,
      detail:
        "Kolommen die zo op elkaar lijken zijn niet los te beoordelen: het model kan wel zeggen wat ze samen " +
        "doen, niet wat elk apart doet." +
        (aIsChannel !== bIsChannel
          ? ` "${first}" is geen kanaal maar een hulpkolom, dus die kun je het makkelijkst missen.`
          : ""),
      choices: [
        { id: dropId(first), label: `Laat "${first}" weg`, effect: `Alleen "${second}" gaat mee in het model.`, changesData: true },
        { id: dropId(second), label: `Laat "${second}" weg`, effect: `Alleen "${first}" gaat mee in het model.`, changesData: true },
        { id: "keep", label: "Houd ze allebei", effect: "Je krijgt dan hun gezamenlijke effect, niet elk apart.", changesData: false },
      ],
      defaultChoice: "keep",
      evidence: duplicateEvidence(profile, pair.a, pair.b, pair.r),
    });
  }

  return { findings, notes };
}

/**
 * Wat de gemaakte keuzes met de data doen, in gewone taal — één regel per keuze die iets
 * verandert.
 *
 * Wordt op twee plekken gelezen: de kaart telt ermee hoeveel van de vragen doorwerken, en de
 * flow-route zet de regels in het gesprek, zodat er in het transcript staat wát er is
 * besloten en waarom. Zonder deze vertaling zou een toelichting ("Black Friday") alleen in
 * een kolomnaam overleven.
 */
export function describeChoices(
  findings: DataFinding[],
  choices: Record<string, string>,
  notes: Record<string, string>,
): string[] {
  const lines: string[] = [];
  for (const finding of findings) {
    const chosen = finding.choices.find((c) => c.id === (choices[finding.id] ?? finding.defaultChoice));
    if (!chosen?.changesData) continue;
    // Alleen de toelichting bij een keuze die er ook om vroeg: wie eerst "er speelde iets
    // bijzonders" typt en daarna toch "laat staan" kiest, hoort zijn tekst niet terug te zien.
    const note = chosen.note ? notes[finding.id]?.trim() : undefined;
    lines.push(`${finding.headline} → ${chosen.effect}${note ? ` Reden: ${note}.` : ""}`);
  }
  return lines;
}
