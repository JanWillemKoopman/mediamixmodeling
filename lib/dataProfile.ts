// Builds a compact, full-series statistical profile of one uploaded CSV, client-side at
// upload time — no server round-trip, no AI call. This is the cheap half of "give Claude
// real eyes on the data" (lib/dataProfile → cached on source_files.profile → fed into the
// architect context): where the 15-line preview only shows the first rows, this scans the
// WHOLE series, so an outlier week, a mid-series gap, or two near-identical channels become
// visible to the architect instead of being invisible until a fit goes wrong.
//
// Reuses the pure stats helpers in lib/eda.ts (already used by the client-side EDA step),
// so there is one implementation of column classification / stats / correlation.
//
// Naast de samenvattende cijfers draagt het profiel de reeks zélf mee (`labels` +
// `ProfileColumnStats.series`) en de precieze plek van elk gat. Dat is wat stap 4 nodig
// heeft om een bevinding te laten ZIEN: een piek van 28.298 zegt niets zonder de weken
// eromheen, en "twee weken geen waarde" is pas na te kijken als erbij staat wélke twee.

import {
  classifyColumns,
  computeColumnStats,
  computeCorrelationMatrix,
  type ColumnKind,
} from "@/lib/eda";
import type { ProfileColumnStats, ProfileMissingRun, SourceProfile } from "@/lib/types";

const DATE_NAME_HINT = /date|datum|week|dag|day|periode/i;
// |z| beyond this flags a week as an outlier worth a possible event dummy. 3.5 keeps it to
// genuine spikes rather than ordinary week-to-week variation.
const OUTLIER_Z = 3.5;
const MAX_OUTLIERS_PER_COLUMN = 6;
// A channel pair this correlated is effectively one signal — the model can't attribute
// separately, and the architect should flag it (drop one, or combine).
const HIGH_CORRELATION = 0.85;
// Boven dit aantal rijen gaat de volledige reeks niet mee het profiel in. Een MMM-bestand is
// wekelijks (of dagelijks over een paar jaar) en blijft daar ruim onder; een uitschieter van
// honderdduizend rijen hoort geen megabyte JSON in elke paginalading te duwen. Zonder reeks
// werkt alles gewoon door — stap 4 laat dan de grafiekjes weg, niet de vragen.
const MAX_SERIES_ROWS = 1200;
// Hoeveel losse gaten er per kolom worden onthouden. Genoeg om te zeggen wélke weken het
// zijn; niet zoveel dat een kapotte kolom het profiel laat ontploffen.
const MAX_MISSING_RUNS = 24;

function pickDateColumn(columns: string[], kinds: Record<string, ColumnKind>): string | null {
  const dateCols = columns.filter((c) => kinds[c] === "date");
  if (dateCols.length === 0) return null;
  return dateCols.find((c) => DATE_NAME_HINT.test(c)) ?? dateCols[0];
}

// Where the empty cells sit, as consecutive runs. The longest run is what a fill strategy
// must bridge (10 scattered gaps and one 10-week hole need different handling), and the
// first/last label of each run is what lets the UI say WHICH weeks are missing instead of
// only how many — the difference between a claim the user can check and one they can't.
function missingRuns(
  rows: Record<string, unknown>[],
  col: string,
  labels: string[],
): ProfileMissingRun[] {
  const runs: ProfileMissingRun[] = [];
  let start = -1;
  const close = (end: number) => {
    if (start < 0) return;
    runs.push({
      start,
      length: end - start,
      start_label: labels[start] ?? `rij ${start + 1}`,
      end_label: labels[end - 1] ?? `rij ${end}`,
    });
    start = -1;
  };
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i][col];
    const empty = v === null || v === undefined || v === "";
    if (empty && start < 0) start = i;
    if (!empty) close(i);
  }
  close(rows.length);
  // De langste gaten eerst bewaren, daarna weer op volgorde van de reeks zetten: bij een
  // kolom met veel gaten zijn de lange de interessante, maar lezen doe je ze chronologisch.
  return runs
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_MISSING_RUNS)
    .sort((a, b) => a.start - b.start);
}

function longestMissingRun(runs: ProfileMissingRun[]): number {
  return runs.reduce((longest, run) => Math.max(longest, run.length), 0);
}

/** De reeks zoals hij in het bestand staat: één waarde per rij, null waar de cel leeg was. */
function columnSeries(rows: Record<string, unknown>[], col: string): (number | null)[] {
  return rows.map((row) => {
    const raw = row[col];
    if (raw === null || raw === undefined || raw === "") return null;
    const num = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(num) ? num : null;
  });
}

function findOutliers(
  rows: Record<string, unknown>[],
  col: string,
  dateCol: string | null,
  mean: number,
  std: number,
): ProfileColumnStats["outliers"] {
  if (!(std > 0)) return [];
  const out: ProfileColumnStats["outliers"] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i][col];
    if (raw === null || raw === undefined || raw === "") continue;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value)) continue;
    const z = (value - mean) / std;
    if (Math.abs(z) >= OUTLIER_Z) {
      const label = dateCol ? String(rows[i][dateCol] ?? `rij ${i + 1}`) : `rij ${i + 1}`;
      out.push({ label, value, z: Math.round(z * 10) / 10 });
    }
  }
  // Keep the most extreme handful so the profile stays compact for the prompt.
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, MAX_OUTLIERS_PER_COLUMN);
}

export function buildSourceProfile(
  columns: string[],
  rows: Record<string, unknown>[],
): SourceProfile {
  const kinds = classifyColumns(columns, rows);
  const dateCol = pickDateColumn(columns, kinds);

  let dateRange: [string, string] | null = null;
  if (dateCol && rows.length > 0) {
    const first = rows[0]?.[dateCol];
    const last = rows[rows.length - 1]?.[dateCol];
    if (first != null && last != null) dateRange = [String(first), String(last)];
  }

  // De x-as van elke reeks: het datumlabel van de rij, of anders het rijnummer. Eén keer
  // opgebouwd en door alle kolommen gedeeld — ze komen tenslotte uit dezelfde rijen.
  const labels = rows.map((row, i) =>
    dateCol ? String(row[dateCol] ?? `rij ${i + 1}`) : `rij ${i + 1}`,
  );
  const keepSeries = rows.length <= MAX_SERIES_ROWS;

  const columnStats: ProfileColumnStats[] = [];
  const numericCols: string[] = [];
  for (const col of columns) {
    const kind = kinds[col];
    const runs = missingRuns(rows, col, labels);
    if (kind !== "numeric") {
      const nonEmpty = rows.filter((r) => r[col] !== null && r[col] !== undefined && r[col] !== "").length;
      columnStats.push({
        name: col,
        kind,
        n: nonEmpty,
        n_missing: rows.length - nonEmpty,
        min: null,
        max: null,
        mean: null,
        std: null,
        p25: null,
        p50: null,
        p75: null,
        longest_missing_run: longestMissingRun(runs),
        outliers: [],
        missing_runs: runs,
      });
      continue;
    }
    numericCols.push(col);
    const s = computeColumnStats(rows, col);
    columnStats.push({
      name: col,
      kind,
      n: s?.n ?? 0,
      n_missing: s?.nMissing ?? rows.length,
      min: s?.min ?? null,
      max: s?.max ?? null,
      mean: s?.mean ?? null,
      std: s?.std ?? null,
      p25: s?.p25 ?? null,
      p50: s?.median ?? null,
      p75: s?.p75 ?? null,
      longest_missing_run: longestMissingRun(runs),
      outliers: s ? findOutliers(rows, col, dateCol, s.mean, s.std) : [],
      missing_runs: runs,
      ...(keepSeries ? { series: columnSeries(rows, col) } : {}),
    });
  }

  // Pairwise correlation over the numeric columns; keep only the strong pairs.
  const highCorrelations: SourceProfile["high_correlations"] = [];
  if (numericCols.length >= 2) {
    const matrix = computeCorrelationMatrix(rows, numericCols);
    for (let i = 0; i < numericCols.length; i++) {
      for (let j = i + 1; j < numericCols.length; j++) {
        const r = matrix[i][j];
        if (Number.isFinite(r) && Math.abs(r) >= HIGH_CORRELATION) {
          highCorrelations.push({ a: numericCols[i], b: numericCols[j], r: Math.round(r * 100) / 100 });
        }
      }
    }
    highCorrelations.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
  }

  return {
    n_rows: rows.length,
    date_column: dateCol,
    date_range: dateRange,
    columns: columnStats,
    high_correlations: highCorrelations.slice(0, 12),
    ...(keepSeries ? { labels } : {}),
  };
}
