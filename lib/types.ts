// Domain types mirroring the `mmm` Postgres schema (supabase/migrations/0021_mmm_v2_schema.sql).
//
// The shape of this file encodes the architecture. Two things are deliberately absent:
//
//   * There is no type for a prior. The app never sends one — it sends *intent* (ordinal
//     words, no numbers) and the worker derives the priors from measured statistics of the
//     actual dataset. A `beta_sigma` field here would be an invitation to reimplement
//     mmm_core.model.priors in TypeScript, and a second implementation of the most
//     consequential numbers in the product is exactly what must not exist.
//   * There is no `storage_path` on anything the client sends. A recipe references
//     `source_file_id`; a run references `dataset_version_id`. Paths are resolved
//     server-side, so a client (or a language model) cannot name a file it has no right to.

export type ProjectStatus = "draft" | "published" | "archived";
export type ColumnRole = "kpi" | "spend" | "control";
export type ChannelUnit = "currency" | "impressions" | "grp" | "sendings" | "clicks";
export type KpiType = "revenue" | "orders" | "leads" | "sessions";
export type FillStrategy = "zero" | "ffill" | "bfill" | "interpolate" | "mean" | "median";

/** Raw-table cleaning applied to one source before role mapping (mmm_core.ingestion.transforms). */
export type TransformOp =
  | "rename"
  | "drop_columns"
  | "filter_rows"
  | "drop_duplicates"
  | "scale"
  | "combine"
  | "split"
  | "recode"
  | "parse_date"
  | "pivot";

/** A derived control column computed during the merge (mmm_core.ingestion.feature_engineering). */
export type FeatureOp =
  | "lag"
  | "rolling_mean"
  | "rolling_sum"
  | "diff"
  | "ratio"
  | "product"
  | "sum"
  | "log1p"
  | "zscore"
  | "winsorize"
  | "recurring_week_dummy";

export interface Project {
  id: string;
  name: string;
  client_company: string | null;
  status: ProjectStatus;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
  // Average gross margin in euros per KPI unit (e.g. 12.50 per order; for a revenue KPI:
  // profit per euro of revenue). Break-even ROAS is 1/margin, not 1.0 — without it the
  // dashboard advises against the wrong threshold.
  kpi_margin: number | null;
}

// --- uploaded source files ---------------------------------------------------------

export interface SourceFile {
  id: string;
  project_id: string;
  name: string;
  storage_path: string;
  preview: string | null;
  profile: SourceProfile | null;
  mapping: ColumnMapping | null;
  inspection_confirmed_at: string | null;
  content_sha256: string | null;
  size_bytes: number | null;
  encoding: string | null;
  n_rows: number | null;
  n_columns: number | null;
  created_at: string;
}

export interface ProfileColumnStats {
  name: string;
  kind: "date" | "numeric" | "text";
  n: number;
  n_missing: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  std: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  longest_missing_run: number;
  outliers: { label: string; value: number; z: number }[];
}

export interface SourceProfile {
  n_rows: number;
  date_column: string | null;
  date_range: [string, string] | null;
  columns: ProfileColumnStats[];
  high_correlations: { a: string; b: string; r: number }[];
}

// --- column semantics ----------------------------------------------------------------
// The AI proposes; `validate_columns` in mmm-core decides. A proposal the validator
// rejects never reaches a model, so a misread column name costs a question rather than a
// wrong result.

export interface ColumnMappingEntry {
  name: string;
  role: ColumnRole | "date" | "ignore";
  meaning: string;
  unit: ChannelUnit | null;
  confidence: "hoog" | "middel" | "laag";
}

export interface ColumnMapping {
  granularity: "week" | "day" | "onbekend";
  layout: "breed" | "lang" | "onbekend";
  currency: string | null;
  columns: ColumnMappingEntry[];
  reasoning: string;
}

/** One reason a column cannot play its assigned role (mmm_core.ingestion.columns). */
export interface ColumnFinding {
  column: string;
  code: string;
  severity: "blocking" | "warning";
  message: string;
  suggested_role: ColumnRole | "date" | "ignore" | null;
}

// --- dataset versions -----------------------------------------------------------------

export type DatasetStatus = "queued" | "building" | "ready" | "failed";
export type DatasetVerdict = "usable" | "usable_with_warnings" | "not_usable";

/** What to merge and how. Sources are named by id — never by path. */
export interface DatasetRecipe {
  sources: {
    source_file_id: string;
    name: string;
    date_column?: string;
    essential?: boolean;
    transforms?: { op: string; params?: Record<string, unknown> }[];
    columns: {
      name: string;
      role: ColumnRole;
      output_name?: string;
      /** control columns only: how to fill missing weeks inside the analysis window */
      fill?: FillStrategy;
    }[];
  }[];
  event_dummies?: { name: string; weeks: [number, number][] }[];
  features?: {
    name: string;
    op: string;
    inputs: string[];
    params?: Record<string, number | number[] | null>;
  }[];
}

export interface QualityIssue {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  source?: string | null;
  details?: Record<string, unknown>;
}

export interface DatasetPreview {
  columns: { name: string; role: ColumnRole | null }[];
  n_weeks: number;
  head: Record<string, string | number | null>[];
  tail: Record<string, string | number | null>[];
  summary: Record<
    string,
    { role: ColumnRole | null; n_missing: number; min: number | null; max: number | null; mean: number | null }
  >;
}

export interface DatasetVersion {
  id: string;
  project_id: string;
  version_no: number;
  source_file_ids: string[];
  recipe: DatasetRecipe;
  status: DatasetStatus;
  master_path: string | null;
  /** Content hash of the merged table. A run records it, so a result is always traceable. */
  master_sha256: string | null;
  window_start: string | null;
  window_end: string | null;
  n_weeks: number | null;
  frequency: string | null;
  column_roles: Record<string, ColumnRole> | null;
  column_units: Record<string, ChannelUnit> | null;
  column_notes: Record<string, string> | null;
  suitability: { issues: QualityIssue[] } | null;
  verdict: DatasetVerdict | null;
  preview: DatasetPreview | null;
  error_code: string | null;
  /** Plain language, safe to show. `error_technical` is builder-only and not fetched here. */
  error_message: string | null;
  created_at: string;
  built_at: string | null;
  approved_at: string | null;
}

// --- model intent: the closed vocabulary the AI and the user share --------------------
// Mirrors mmm_core.model.intent. Every field is an enum: an LLM can pick the wrong word,
// never a wrong number.

export type ChannelRole = "demand_capture" | "brand_building" | "mixed";
export type Carryover = "none" | "short" | "medium" | "long" | "unknown";
export type Strength = "small" | "moderate" | "large" | "unknown";
export type SaturationBelief =
  | "far_from_saturated"
  | "approaching"
  | "likely_saturated"
  | "unknown";
export type SeasonalityBelief = "none" | "mild" | "strong" | "unknown";
export type MediaShare = "small" | "moderate" | "large" | "dominant";

export interface ChannelIntent {
  name: string;
  unit: ChannelUnit;
  role?: ChannelRole;
  carryover?: Carryover;
  strength?: Strength;
  saturation?: SaturationBelief;
}

export interface ModelIntent {
  kpi: string;
  kpi_type: KpiType;
  channels: ChannelIntent[];
  control_columns?: string[];
  seasonality?: SeasonalityBelief;
  expect_trend?: boolean;
  expect_structural_break?: boolean;
  media_share_belief?: MediaShare | null;
  notes?: string[];
}

/** Where one derived prior came from, in terms the user can check. */
export interface PriorProvenance {
  parameter: string;
  value: number;
  derived_from: string;
}

export interface ConfigIssue {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  column: string | null;
}

/** The KPI range the priors alone imply, versus the range actually observed. */
export interface PriorPredictiveReview {
  observed_low: number;
  observed_high: number;
  prior_low: number;
  prior_high: number;
  admits_observed: boolean;
  not_absurdly_wide: boolean;
  ok: boolean;
}

export interface ModelConfiguration {
  id: string;
  project_id: string;
  dataset_version_id: string;
  intent: ModelIntent;
  /** Filled by the worker; the app never writes this. */
  resolved_spec: Record<string, unknown> | null;
  spec_sha256: string | null;
  provenance: PriorProvenance[] | null;
  issues: ConfigIssue[] | null;
  prior_predictive: PriorPredictiveReview | null;
  prior_gate_passed: boolean;
  created_at: string;
}

// --- model runs -------------------------------------------------------------------------

export type RunState =
  | "queued"
  | "validating"
  | "preparing_data"
  | "building_model"
  | "sampling"
  | "validating_model"
  | "calculating_results"
  | "completed"
  | "failed"
  | "cancelled";

/** In order, so the UI can show "step 4 of 7" without hard-coding the list. */
export const RUN_STATE_SEQUENCE: RunState[] = [
  "queued",
  "validating",
  "preparing_data",
  "building_model",
  "validating_model",
  "sampling",
  "calculating_results",
  "completed",
];

/** What the user is told at each stage. No jargon, no spinner without an explanation. */
export const RUN_STATE_LABEL: Record<RunState, string> = {
  queued: "In de wachtrij",
  validating: "Instellingen controleren",
  preparing_data: "Data klaarzetten",
  building_model: "Model opbouwen en aannames toetsen",
  validating_model: "Betrouwbaarheid toetsen",
  sampling: "Berekenen",
  calculating_results: "Resultaten samenstellen",
  completed: "Klaar",
  failed: "Mislukt",
  cancelled: "Gestopt",
};

export type RunErrorCode =
  | "DATA_QUALITY"
  | "CONFIG_INVALID"
  | "PRIOR_GATE_FAILED"
  | "SAMPLING_FAILED"
  | "TIMEOUT"
  | "OOM"
  | "STORAGE_UNAVAILABLE"
  | "CANCELLED"
  | "INTERNAL";

export interface ModelRun {
  id: string;
  project_id: string;
  model_configuration_id: string;
  dataset_version_id: string;
  state: RunState;
  state_changed_at: string;
  attempt: number;
  max_attempts: number;
  cancel_requested: boolean;
  seed: number;
  sample_params: Record<string, number>;
  // Reproducibility: everything that can change a number.
  dataset_sha256: string | null;
  spec_sha256: string | null;
  mmm_core_version: string | null;
  package_versions: Record<string, string> | null;
  error_code: RunErrorCode | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

// --- diagnostics, validation, results -----------------------------------------------------

export interface RunDiagnostics {
  convergence: {
    max_r_hat: number;
    min_ess_bulk: number;
    min_ess_tail: number | null;
    n_divergences: number;
    min_e_bfmi: number | null;
    n_max_treedepth: number;
  };
  fit: {
    r2: number;
    mape: number | null;
    interval_coverage_94: number;
    interval_coverage_80: number;
    interval_coverage_50: number;
    residual_autocorrelation: number | null;
    decomposition_ok: boolean;
  };
  identifiability: ChannelIdentifiability[] | null;
  out_of_sample: { holdout_mape: number | null };
  placebo: { contribution_share: number | null };
}

export interface ChannelIdentifiability {
  name: string;
  verdict: "identified" | "weak" | "not_identified";
  prior_posterior_overlap: number | null;
  max_contribution_correlation: number;
  most_correlated_with: string | null;
  relative_interval_width: number;
  prior_sensitivity: number | null;
  reasons: string[];
}

/** The four rungs. "Sampling finished" is the floor, not the verdict. */
export type ValidationLevel =
  | "not_usable"
  | "technically_completed"
  | "statistically_valid"
  | "usable_for_decisions";

export type AllowedOutput =
  | "diagnostics"
  | "total_media_contribution"
  | "channel_contributions"
  | "response_curves"
  | "budget_advice"
  | "publish";

export interface ValidationCheck {
  code: string;
  passed: boolean;
  severity: "blocking" | "warning" | "info";
  message: string;
  value: number | null;
}

export interface ModelValidation {
  model_run_id: string;
  level: ValidationLevel;
  ruleset_version: string;
  allowed_outputs: AllowedOutput[];
  blocking_reasons: string[];
  warning_reasons: string[];
  checks: ValidationCheck[];
  per_channel: { name: string; usable: boolean; reasons: string[] }[];
  inseparable_groups: string[][];
}

export const VALIDATION_LEVEL_LABEL: Record<ValidationLevel, string> = {
  not_usable: "Niet bruikbaar",
  technically_completed: "Berekend, maar niet betrouwbaar genoeg",
  statistically_valid: "Statistisch in orde",
  usable_for_decisions: "Bruikbaar om budget op te sturen",
};

export function allows(validation: ModelValidation | null, output: AllowedOutput): boolean {
  return Boolean(validation?.allowed_outputs.includes(output));
}

// --- fit summary (what mmm-core writes; what the dashboard reads) -------------------------

export interface Interval {
  p3: number;
  p50: number;
  p97: number;
}

export interface ChannelResult {
  name: string;
  absolute_contribution: Interval;
  contribution_share: Interval;
  /** null when the channel had no pressure at all — "KPI per zero euros" is not a number. */
  roas: Interval | null;
  adstock_half_life_weeks: Interval;
  saturation_point: Interval;
  total_spend: number;
  /** Only a `currency` channel has a ROAS in the everyday sense. */
  unit: ChannelUnit;
  direct_contribution?: Interval | null;
  carryover_contribution?: Interval | null;
  direct_share?: Interval | null;
}

export interface CurvePoint {
  weekly_spend: number;
  contribution: Interval;
  extrapolated: boolean;
}

export interface ResponseCurve {
  name: string;
  current_weekly_spend: number;
  marginal_roas_at_current: Interval;
  points: CurvePoint[];
}

export interface OptimalAllocation {
  total_weekly_budget: number;
  per_channel: Record<string, number>;
  predicted_contribution: Interval;
  capped_channels: string[];
  /** Channels held fixed because their pressure is not money. */
  fixed_channels: string[];
}

export interface FrontierPoint {
  total_weekly_budget: number;
  predicted_contribution: Interval;
}

export interface WeeklyDecomposition {
  dates: string[];
  actual: number[];
  expected_p50: number[];
  expected_p3: number[];
  expected_p97: number[];
  baseline_p50: number[];
  channels_p50: Record<string, number[]>;
  channel_spend?: Record<string, number[]>;
  /** Leading weeks that only built up the carry-over and were not scored. */
  burn_in_weeks: number;
}

export interface BaselineDecomposition {
  dates: string[];
  components: Record<string, number[]>;
  control_names: string[];
}

export interface FitSummary {
  kpi: string;
  /** What the KPI counts — decides the wording of every money figure in the interface. */
  kpi_type: KpiType;
  n_weeks: number;
  window: [string, string];
  baseline_contribution: Interval;
  channels: ChannelResult[];
  diagnostics: {
    max_r_hat: number;
    min_ess_bulk: number;
    min_ess_tail: number | null;
    n_divergences: number;
    min_e_bfmi: number | null;
    n_max_treedepth: number;
    r2: number;
    mape: number | null;
    interval_coverage_94: number;
    interval_coverage_80: number;
    interval_coverage_50: number;
    residual_autocorrelation: number | null;
    decomposition_ok: boolean;
  };
  draws: number;
  chains: number;
  validation: ModelValidation | null;
  identifiability: ChannelIdentifiability[];
  /** Absent unless the validation level allows it — an unusable model leaves no stale advice. */
  response_curves?: ResponseCurve[];
  optimal_allocation?: OptimalAllocation | null;
  efficiency_frontier?: FrontierPoint[];
  weekly?: WeeklyDecomposition | null;
  baseline_decomposition?: BaselineDecomposition | null;
}

/** A generated chart image (base64 data URL) produced by the deep-analysis step. */
export interface AnalysisChart {
  filename: string;
  mime_type: string;
  data_url: string;
}

export interface RunAnalysis {
  text: string;
  charts: AnalysisChart[];
  model: string;
  generated_at: string;
}

export interface ClientSummary {
  text: string;
  model: string;
  generated_at: string;
}

export interface ModelResult {
  model_run_id: string;
  project_id: string;
  summary: FitSummary;
  inference_data_path: string | null;
  analysis: RunAnalysis | null;
  client_summary: ClientSummary | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

// --- deep data inspection ------------------------------------------------------------------

export interface InspectionFinding {
  kind:
    | "outlier"
    | "level_shift"
    | "seasonality"
    | "collinearity"
    | "gap"
    | "trend"
    | "distribution"
    | "other";
  column: string | null;
  detail: string;
  suggestion: string | null;
  severity: "info" | "let_op" | "belangrijk";
}

export interface DataInspection {
  id: string;
  project_id: string;
  dataset_version_id: string | null;
  scope: "raw" | "master";
  findings: InspectionFinding[] | null;
  narrative: string | null;
  model: string | null;
  error: string | null;
  status: "running" | "done" | "error";
  created_at: string;
}

// --- elicited business context ---------------------------------------------------------------

export interface BusinessContextNote {
  topic: "branche" | "seizoen" | "campagne" | "offline_kanaal" | "experiment" | "prijs" | "overig";
  fact: string;
  relates_to: string | null;
  /** Whether the user said this or the AI inferred it. Only a stated fact may drive a prior. */
  source?: "user_stated" | "ai_inferred";
}

export interface ProjectContext {
  project_id: string;
  industry: string | null;
  notes: BusinessContextNote[] | null;
  description: string | null;
  updated_at: string;
}

/** A measured incrementality experiment. The only route to a ROAS calibration. */
export interface RecordedExperiment {
  channel: string;
  kind: "geo_lift" | "holdout" | "switchback" | "other";
  period: string;
  measured_roas: number;
  uncertainty_sd: number;
  confirmed_by: string;
  confirmed_at: string;
}

// --- the view model the wizard works on ------------------------------------------------
//
// A run, its result and its verdict live in three tables — for good reasons (a run can
// finish without a usable result; a verdict has its own ruleset version). The UI should not
// have to re-join them at every call site, and more importantly it should not be *able* to
// hold a summary without the verdict that says what may be done with it. So the page joins
// them once, here.

export interface RunView {
  run: ModelRun;
  /** Absent while the run is still going, or when it failed. */
  result: ModelResult | null;
  /** Absent only for a run that never reached the validation step. */
  validation: ModelValidation | null;
}

export function isFinished(run: ModelRun): boolean {
  return run.state === "completed" || run.state === "failed" || run.state === "cancelled";
}

export function isRunning(run: ModelRun): boolean {
  return !isFinished(run);
}

/** True when this run's numbers may be shown at all. */
export function hasShowableResult(view: RunView): boolean {
  return Boolean(view.result && allows(view.validation, "channel_contributions"));
}

/** Everything the wizard needs to decide what to show. Assembled server-side, once. */
export interface ProjectSnapshot {
  project: Project;
  sources: SourceFile[];
  dataset: DatasetVersion | null;
  approvedDataset: DatasetVersion | null;
  configuration: ModelConfiguration | null;
  runs: RunView[];
  context: ProjectContext | null;
  inspection: DataInspection | null;
}
