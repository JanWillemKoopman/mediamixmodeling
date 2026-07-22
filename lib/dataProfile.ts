// Builds a compact, full-series statistical profile of one uploaded CSV, client-side at
// upload time — no server round-trip, no AI call. This is the cheap half of "give Claude
// real eyes on the data" (lib/dataProfile → cached on source_files.profile → fed into the
// architect context): where the 15-line preview only shows the first rows, this scans the
// WHOLE series, so an outlier week, a mid-series gap, or two near-identical channels become
// visible to the architect instead of being invisible until a fit goes wrong.
//
// Reuses the pure stats helpers in lib/eda.ts (already used by the client-side EDA step),
// so there is one implementation of column classification / stats / correlation.

import {
  classifyColumns,
  computeColumnStats,
  computeCorrelationMatrix,
  type ColumnKind,
} from "@/lib/eda";
import type { ProfileColumnStats, SourceProfile } from "@/lib/types";

const DATE_NAME_HINT = /date|datum|week|dag|day|periode/i;
// |z| beyond this flags a week as an outlier worth a possible event dummy. 3.5 keeps it to
// genuine spikes rather than ordinary week-to-week variation.
const OUTLIER_Z = 3.5;
const MAX_OUTLIERS_PER_COLUMN = 6;
// A channel pair this correlated is effectively one signal — the model can't attribute
// separately, and the architect should flag it (drop one, or combine).
const HIGH_CORRELATION = 0.85;

function pickDateColumn(columns: string[], kinds: Record<string, ColumnKind>): string | null {
  const dateCols = columns.filter((c) => kinds[c] === "date");
  if (dateCols.length === 0) return null;
  return dateCols.find((c) => DATE_NAME_HINT.test(c)) ?? dateCols[0];
}

// The longest run of consecutive empty cells in a column — the gap a fill strategy must
// bridge. Distinct from the total missing count: 10 scattered gaps and one 10-week hole
// need different handling, and the architect should see which it is.
function longestMissingRun(rows: Record<string, unknown>[], col: string): number {
  let longest = 0;
  let current = 0;
  for (const row of rows) {
    const v = row[col];
    if (v === null || v === undefined || v === "") {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
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

  const columnStats: ProfileColumnStats[] = [];
  const numericCols: string[] = [];
  for (const col of columns) {
    const kind = kinds[col];
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
        longest_missing_run: longestMissingRun(rows, col),
        outliers: [],
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
      longest_missing_run: longestMissingRun(rows, col),
      outliers: s ? findOutliers(rows, col, dateCol, s.mean, s.std) : [],
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
  };
}
