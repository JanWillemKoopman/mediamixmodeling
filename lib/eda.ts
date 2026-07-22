// Pure, client-safe stats helpers for the EDA step. Everything here runs on data already
// downloaded into the browser — no server round-trip, no AI call, so exploring a dataset
// costs nothing beyond the initial CSV download.

export type ColumnKind = "date" | "numeric" | "text";

// Samples the first rows of each column to guess its kind: an ISO-ish date string, a
// number (papaparse's dynamicTyping already converts most), or free text.
export function classifyColumns(columns: string[], rows: Record<string, unknown>[]): Record<string, ColumnKind> {
  const sample = rows.slice(0, 50);
  const kinds: Record<string, ColumnKind> = {};
  for (const col of columns) {
    let numeric = 0;
    let dateLike = 0;
    let total = 0;
    for (const row of sample) {
      const v = row[col];
      if (v === null || v === undefined || v === "") continue;
      total++;
      if (typeof v === "number") numeric++;
      else if (typeof v === "string") {
        if (/^\d{4}-\d{2}-\d{2}/.test(v)) dateLike++;
        else if (v.trim() !== "" && !Number.isNaN(Number(v))) numeric++;
      }
    }
    if (total === 0) kinds[col] = "text";
    else if (dateLike / total > 0.6) kinds[col] = "date";
    else if (numeric / total > 0.6) kinds[col] = "numeric";
    else kinds[col] = "text";
  }
  return kinds;
}

export function extractNumericValues(rows: Record<string, unknown>[], col: string): number[] {
  const values: number[] = [];
  for (const row of rows) {
    const raw = row[col];
    if (raw === null || raw === undefined || raw === "") continue;
    const num = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(num)) values.push(num);
  }
  return values;
}

export interface ColumnStats {
  n: number;
  nMissing: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  std: number;
  p25: number;
  p75: number;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

export function computeColumnStats(rows: Record<string, unknown>[], col: string): ColumnStats | null {
  const values = extractNumericValues(rows, col);
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return {
    n,
    nMissing: rows.length - n,
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    median: quantile(sorted, 0.5),
    std: Math.sqrt(variance),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
  };
}

export function histogram(values: number[], bins = 12): { bin: string; count: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ bin: min.toLocaleString("nl-NL", { maximumFractionDigits: 0 }), count: values.length }];
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  return counts.map((count, i) => ({
    bin: (min + i * width).toLocaleString("nl-NL", { maximumFractionDigits: 0 }),
    count,
  }));
}

function pearson(a: (number | null)[], b: (number | null)[]): number {
  const pairs: [number, number][] = [];
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    if (av != null && bv != null) pairs.push([av, bv]);
  }
  if (pairs.length < 2) return NaN;
  const n = pairs.length;
  const meanA = pairs.reduce((s, p) => s + p[0], 0) / n;
  const meanB = pairs.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (const [x, y] of pairs) {
    num += (x - meanA) * (y - meanB);
    denA += (x - meanA) ** 2;
    denB += (y - meanB) ** 2;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? NaN : num / den;
}

// Pairwise Pearson correlation between every pair of the given (numeric) columns.
export function computeCorrelationMatrix(rows: Record<string, unknown>[], cols: string[]): number[][] {
  const series = cols.map((c) =>
    rows.map((r) => {
      const raw = r[c];
      if (raw === null || raw === undefined || raw === "") return null;
      const num = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(num) ? num : null;
    }),
  );
  return cols.map((_, i) => cols.map((_, j) => (i === j ? 1 : pearson(series[i], series[j]))));
}
