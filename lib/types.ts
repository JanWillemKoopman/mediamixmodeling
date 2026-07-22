// Domain types mirroring the `mmm` Postgres schema (supabase/migrations/0001_mmm_init.sql).

export type ProjectStatus = "draft" | "published" | "archived";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type ColumnRole = "kpi" | "spend" | "control";
export type ChannelType = "intent" | "brand" | "generic";
export type AdstockType = "geometric" | "delayed";
export type SaturationType = "hill" | "logistic";
export type LikelihoodType = "normal" | "student_t" | "poisson" | "negative_binomial";
export type TrendType = "linear" | "piecewise";
export type FillStrategy = "zero" | "ffill" | "bfill" | "interpolate" | "mean" | "median";

export interface Project {
  id: string;
  name: string;
  client_company: string | null;
  status: ProjectStatus;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
  eda_completed_at: string | null;
  // Gemiddelde brutomarge in euro's per verkochte KPI-eenheid (bv. 12.50 per order;
  // bij een omzet-KPI: winst per euro omzet). null = niet ingevuld. Maakt ROI en de
  // marge-gecorrigeerde break-evenlijn in het dashboard mogelijk.
  kpi_margin: number | null;
}

export interface SourceFile {
  id: string;
  project_id: string;
  name: string;
  storage_path: string;
  role_hint: string | null;
  // First ~15 lines of a CSV source, cached at upload time (SourceUpload.tsx) so the chat
  // architect route doesn't re-download the file from Storage on every turn. Null for
  // binary formats (xlsx) and for files uploaded before this column existed.
  preview: string | null;
  // A compact full-series statistical profile computed client-side at upload time
  // (lib/dataProfile.ts). Unlike `preview` (first 15 lines only) this sees the WHOLE
  // series, so it can surface outliers, gaps and channel collinearity that fall outside
  // the preview window. Null for xlsx and pre-existing rows.
  profile: SourceProfile | null;
  // Column-semantics classification from a separate, cheap Claude call
  // (lib/anthropic/columnMapping.ts, /api/classify-columns). Lets the architect start
  // each turn from a reliable role/unit/granularity guess instead of re-deriving it.
  mapping: ColumnMapping | null;
  // Set once the builder has explicitly confirmed the column-recognition step (date
  // column + granularity, KPI, channel roles/units, controls, coverage period) — the gate
  // between the "inspect" and "prepare" wizard phases. Corrections the builder makes
  // during that confirmation are written back into `mapping.columns[].role`.
  inspection_confirmed_at: string | null;
  created_at: string;
}

// --- Rich statistical profile (lib/dataProfile.ts), cached on source_files.profile ---

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
  // The single longest run of consecutive missing rows (a gap the fill strategy must cover).
  longest_missing_run: number;
  // Weeks whose value is an extreme outlier (|z| > 3.5), with the row's date label + value —
  // the exact thing the architect needs to propose an event dummy, and which the 15-line
  // preview cannot show when the spike falls outside the first/last rows.
  outliers: { label: string; value: number; z: number }[];
}

export interface SourceProfile {
  n_rows: number;
  date_column: string | null;
  date_range: [string, string] | null;
  columns: ProfileColumnStats[];
  // Pairs of numeric columns with |Pearson r| >= 0.85 — near-duplicate channels or a
  // control that mirrors a channel (multicollinearity the model can't disentangle).
  high_correlations: { a: string; b: string; r: number }[];
}

// --- Column-semantics classification (lib/anthropic/columnMapping.ts) ---

export interface ColumnMappingEntry {
  name: string;
  role: ColumnRole | "date" | "ignore";
  // Best guess at what the column measures, in plain Dutch (for the builder to sanity-check).
  meaning: string;
  unit: string | null; // e.g. "euro", "cent", "clicks", "sendings"; null if unknown
  confidence: "hoog" | "middel" | "laag";
}

export interface ColumnMapping {
  granularity: "week" | "day" | "onbekend";
  layout: "breed" | "lang" | "onbekend"; // wide (one col/channel) vs long (channel as a value)
  currency: string | null;
  columns: ColumnMappingEntry[];
  reasoning: string;
}

export type JobProgress = "downloading" | "building_dataset" | "sampling" | "saving";

export interface Job {
  id: string;
  project_id: string;
  type: "fit" | "prepare" | "fit_hierarchical" | "prior_predictive";
  status: JobStatus;
  progress: JobProgress | null;
  config: JobConfig | PrepareRecipe;
  error: string | null;
  attempts: number;
  // Only set on type="prior_predictive" jobs once succeeded — see PriorPredictiveReview
  // below and worker/mmm_worker/prior_predictive.py.
  prior_predictive?: PriorPredictiveReview | null;
  dataset_id?: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

// A generated chart image (base64 data URL) produced by the deep-analysis step.
export interface AnalysisChart {
  filename: string;
  mime_type: string;
  data_url: string;
}

// The deep-analysis step's output: a written interpretation plus charts, generated
// on-demand from the (already computed) FitSummary via Claude's sandboxed code
// execution. Distinct from the chat architect's own inline discussion of results —
// this is a heavier, explicitly-triggered "genereer diepgaande analyse" action.
export interface RunAnalysis {
  text: string;
  charts: AnalysisChart[];
  model: string;
  generated_at: string;
}

// Presentatieklare, door Claude geschreven samenvatting van een run in klanttaal —
// gegenereerd op verzoek van de bouwer als basis voor de klantpresentatie/het rapport.
export interface ClientSummary {
  text: string;
  model: string;
  generated_at: string;
}

export interface ModelRun {
  id: string;
  project_id: string;
  job_id: string | null;
  summary: FitSummary;
  quality: unknown;
  analysis: RunAnalysis | null;
  client_summary?: ClientSummary | null;
  inference_data_path: string | null;
  is_published: boolean;
  created_at: string;
  published_at: string | null;
}

// --- Job config (the contract with mmm-worker/jobspec.py) ---

export interface JobConfig {
  sources: SourceConfig[];
  model: ModelConfig;
  event_dummies?: EventDummyConfig[];
  features?: FeatureSpec[];
  // Mirrors _ALLOWED_SAMPLE_KEYS in worker/mmm_worker/jobspec.py — any other key is
  // silently dropped by the worker rather than rejected.
  sample?: { draws?: number; tune?: number; chains?: number; target_accept?: number; seed?: number };
  // Opt-in extra reliability checks (mmm_worker.jobspec.EvaluationSpec), both default off
  // — each is a full extra fit (or several, for CV folds), so leave unchecked unless the
  // builder wants the longer wait.
  evaluation?: { cross_validation?: boolean; placebo?: boolean };
}

// A 0/1 control column for named ISO weeks (anomalies, one-off promotions, ...) —
// added to the master dataset without editing the raw source file. Declared names are
// appended to `model.control_columns` automatically by mmm-worker/jobspec.py.
export interface EventDummyConfig {
  name: string;
  weeks: [number, number][]; // [iso_year, iso_week] pairs
}

// A raw-table cleaning/reshaping step applied to one source BEFORE role-mapping (mirrors
// mmm_core.ingestion.transforms.TransformSpec). Gives the architect room to tidy messy
// uploads — rename, filter, dedupe, unit/currency conversion, combine/split columns,
// recode categories, force a date parse, long→wide pivot — deterministically.
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

export interface TransformSpec {
  op: TransformOp;
  // Op-specific parameters (see the architect tool description / mmm-core for each op).
  params?: Record<string, unknown>;
}

export interface SourceConfig {
  name: string;
  storage_path: string;
  date_column?: string;
  essential?: boolean;
  // Raw cleaning/reshaping applied to this file before role-mapping, in order.
  transforms?: TransformSpec[];
  columns: {
    name: string;
    role: ColumnRole;
    output_name?: string;
    // control columns only: how to fill missing weeks inside the analysis window.
    fill?: FillStrategy;
  }[];
}

// A derived feature: a new control column computed from existing master columns during
// the merge (mirrors mmm_core.ingestion.feature_engineering.FeatureSpec). Lets the
// architect propose engineered variables (lags, rolling means, ratios/shares,
// interactions, transforms, recurring calendar dummies) without hand-editing raw data.
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

export interface FeatureSpec {
  name: string;
  op: FeatureOp;
  inputs: string[];
  // Op-specific params (weeks/window/lower_q/upper_q/iso_weeks); omitted → op defaults.
  params?: Record<string, number | number[] | null>;
}

// --- Deep data inspection (lib/anthropic/dataInspection.ts, /api/inspect) ---
//
// Claude explores the actual data with pandas in the hosted, sandboxed code_execution
// container and reports back structured findings + a narrative. This is the "give Claude
// real eyes on the data" step — it sees the whole series, not the 15-line preview.

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
  // Human-readable finding in Dutch, with concrete weeks/values where relevant.
  detail: string;
  // A concrete, one-click recipe/config suggestion this finding motivates (optional).
  suggestion: string | null;
  severity: "info" | "let_op" | "belangrijk";
}

export interface DataInspection {
  id: string;
  project_id: string;
  dataset_id: string | null;
  scope: "raw" | "master";
  findings: InspectionFinding[] | null;
  narrative: string | null;
  model: string | null;
  error: string | null;
  created_at: string;
}

// --- Elicited business context (lib/anthropic/architect.ts record_business_context tool) ---
//
// Domain knowledge the architect asks the builder for and stores, so it can turn it into
// priors / calibration / channel_type on the next config — the highest-leverage input a
// Bayesian model has and the one that is otherwise left empty.

export interface BusinessContextNote {
  topic:
    | "branche"
    | "seizoen"
    | "campagne"
    | "offline_kanaal"
    | "experiment"
    | "prijs"
    | "overig";
  // The fact itself, in the builder's own words as captured by the architect.
  fact: string;
  // Which channel(s)/column(s) it bears on, if any (free text as the builder named them).
  relates_to: string | null;
}

export interface ProjectContext {
  project_id: string;
  industry: string | null;
  notes: BusinessContextNote[] | null;
  // Vrij-tekst bedrijfscontext, bovenaan stap 2 ingevuld direct na het uploaden: wie is het
  // bedrijf, welke markt/doelen/bijzonderheden. De AI weegt dit vanaf de eerste stap mee.
  description: string | null;
  updated_at: string;
}

// --- Prior-predictive review (worker/mmm_worker/prior_predictive.py) ---
//
// The KPI range the priors ALONE imply, compared to the observed range — a cheap sanity
// check the architect reads before spending a full fit. Mirrors mmm_core.evaluation
// .PriorPredictiveResult; stored on the prior_predictive job row (jobs.prior_predictive).

export interface PriorPredictiveReview {
  observed_low: number;
  observed_high: number;
  prior_low: number;
  prior_high: number;
  admits_observed: boolean; // prior range covers the observed KPI range
  not_absurdly_wide: boolean; // prior range not >20x the observed range
  ok: boolean;
}

// --- Data preparation (the recipe + result of merging raw uploads into one master
// table, BEFORE the model config step) ---

export type DatasetStatus = "draft" | "preparing" | "prepared" | "failed" | "approved";

// The recipe is exactly the merge instructions: which files, which column -> which role,
// how to fill control gaps, and which weeks to flag as event dummies. No model settings —
// those come later, once the definitive master table exists.
export interface PrepareRecipe {
  sources: SourceConfig[];
  event_dummies?: EventDummyConfig[];
  features?: FeatureSpec[];
}

export interface DatasetColumnSummary {
  role: ColumnRole | null;
  n_missing: number;
  min: number | null;
  max: number | null;
  mean: number | null;
}

export interface DatasetPreview {
  columns: { name: string; role: ColumnRole | null }[];
  n_weeks: number;
  head: Record<string, string | number | null>[];
  tail: Record<string, string | number | null>[];
  summary: Record<string, DatasetColumnSummary>;
}

// Mirrors mmm_core.ingestion.quality.QualityReport's to-JSON shape.
export interface QualityIssue {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  source?: string | null;
  [key: string]: unknown;
}
export interface DatasetQuality {
  issues: QualityIssue[];
}

export interface Dataset {
  id: string;
  project_id: string;
  status: DatasetStatus;
  recipe: PrepareRecipe;
  master_path: string | null;
  window_start: string | null;
  window_end: string | null;
  n_weeks: number | null;
  column_roles: Record<string, ColumnRole> | null;
  quality: DatasetQuality | null;
  preview: DatasetPreview | null;
  // Zakelijke notities van de bouwer per kolom ("tv_grps = landelijke campagne, alleen
  // Q4") — gelezen door de AI bij elk voorstel. Alleen kolommen mét notitie staan erin.
  column_notes: Record<string, string> | null;
  error: string | null;
  created_at: string;
  prepared_at: string | null;
  approved_at: string | null;
  // Set once the builder has explicitly confirmed the parameter-tuning step (adstock/
  // saturation/priors per channel, baseline priors, prior-predictive check) — persisted
  // as an auditable fact, alongside the fit job the wizard's TuningCard starts in the
  // same action (see confirm-tuning/route.ts).
  tuning_confirmed_at: string | null;
  // The confirmed tuning step's model settings, everything the fit job needs EXCEPT
  // kpi/sources/sample (see migration 0017) — read back to assemble the final JobConfig.
  tuning_draft: TuningDraft | null;
}

// Everything propose_model_config's `model` object configures except `kpi` (derived from
// the dataset's confirmed KPI column) — persisted as Dataset.tuning_draft.
export type TuningDraft = Omit<ModelConfig, "kpi">;

// Prior overrides for one channel (any subset; omitted keys keep mmm-core defaults).
export interface ChannelPriors {
  beta_sigma?: number;
  adstock_concentration?: number;
  delayed_peak_weeks?: number;
  delayed_peak_sigma?: number;
  hill_slope_a?: number;
  hill_slope_b?: number;
  halfsat_a?: number;
  halfsat_b?: number;
  logistic_lam_sigma?: number;
}

// Prior overrides for the baseline (non-media) components.
export interface BaselinePriors {
  intercept_sigma?: number;
  trend_sigma?: number;
  season_sigma?: number;
  control_sigma?: number;
  noise_sigma?: number;
  // Laplace scale on each piecewise-trend changepoint step (smaller = stiffer trend).
  changepoint_scale?: number;
}

// An experimentally-measured ROAS (from a lift/geo test) to calibrate a channel against.
export interface RoasCalibration {
  roas: number;
  sd: number;
}

export interface ChannelConfig {
  name: string;
  channel_type?: ChannelType;
  l_max?: number;
  expected_half_life?: number | null;
  adstock?: AdstockType;
  saturation?: SaturationType;
  priors?: ChannelPriors;
  calibration?: RoasCalibration | null;
}

export interface ModelConfig {
  kpi: string;
  channels: ChannelConfig[];
  control_columns?: string[];
  add_trend?: boolean;
  trend_type?: TrendType;
  n_changepoints?: number;
  seasonality_periods?: number | null;
  n_fourier_modes?: number;
  likelihood?: LikelihoodType;
  student_t_nu?: number;
  priors?: BaselinePriors;
}

// --- Fit summary (the JSON mmm-core writes; what the dashboard reads) ---

export interface Interval {
  p3: number;
  p50: number;
  p97: number;
}

export interface ChannelResult {
  name: string;
  absolute_contribution: Interval;
  contribution_share: Interval;
  roas: Interval;
  adstock_half_life_weeks: Interval;
  saturation_point: Interval;
  total_spend: number;
  // Direct/na-ijl-splitsing (mmm_core.model.fit.ChannelResult): het deel van de bijdrage
  // uit uitgaven van dezelfde week (direct) vs doorwerking van eerdere weken (na-ijl).
  // Optioneel: runs van vóór deze uitbreiding hebben deze velden niet.
  direct_contribution?: Interval | null;
  carryover_contribution?: Interval | null;
  direct_share?: Interval | null;
}

export interface QualityGate {
  verdict: "pass" | "warn" | "fail";
  reasons: string[];
  checks: Record<string, boolean>;
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
}

export interface FrontierPoint {
  total_weekly_budget: number;
  predicted_contribution: Interval;
}

export interface FitSummary {
  kpi: string;
  n_weeks: number;
  window: [string, string];
  baseline_contribution: Interval;
  channels: ChannelResult[];
  diagnostics: {
    max_r_hat: number;
    min_ess_bulk: number;
    n_divergences: number;
    r2: number;
    mape: number;
    interval_coverage_94: number;
    decomposition_ok: boolean;
  };
  draws: number;
  chains: number;
  quality_gate?: QualityGate | null;
  response_curves?: ResponseCurve[];
  optimal_allocation?: OptimalAllocation | null;
  efficiency_frontier?: FrontierPoint[];
  weekly?: WeeklyDecomposition | null;
  baseline_decomposition?: BaselineDecomposition | null;
}

// Compacte weekdecompositie (mmm_core.model.fit.WeeklyDecomposition): voedt de
// KPI-opbouwgrafiek en voorspeld-vs-werkelijk in het dashboard. Medianen per component;
// alleen de totale verwachting draagt een 94%-band. Ontbreekt bij oudere runs.
export interface WeeklyDecomposition {
  dates: string[];
  actual: number[];
  expected_p50: number[];
  expected_p3: number[];
  expected_p97: number[];
  baseline_p50: number[];
  channels_p50: Record<string, number[]>;
  // Per-week spend per kanaal (originele eenheden). Voedt de ROAS-in-de-tijd-grafiek
  // (wekelijkse bijdrage ÷ wekelijkse spend). Ontbreekt bij oudere runs.
  channel_spend?: Record<string, number[]>;
}

// Uitsplitsing van de basislijn per week (mediaan, in KPI-eenheden) in structureel niveau,
// trend, seizoen en externe factoren (controls) — zodat de basislijn geen black box meer is.
// Alleen de componenten die het model daadwerkelijk heeft, staan erin. Ontbreekt bij oudere
// runs. Sleutels: "niveau" | "trend" | "seizoen" | "externe_factoren".
export interface BaselineDecomposition {
  dates: string[];
  components: Record<string, number[]>;
  control_names: string[];
}

// --- Hierarchical (multi-region) fit summary ---
//
// Mirrors mmm_core.model.hierarchical.HierSummary.to_json_dict(), with a `kind` field
// added by mmm_worker.runner.run_hier_job() so the wizard can tell a hierarchical summary
// apart from a single-region FitSummary in the same `model_runs.summary` jsonb column.
// Deliberately a separate, unrelated shape rather than folded into FitSummary — a
// hierarchical run has no response_curves/optimal_allocation/quality_gate (see
// mmm_core.model.hierarchical) and the wizard only renders it via HierarchicalSummaryView,
// never SummaryView.

export interface HierChannelResult {
  name: string;
  global_contribution_share: Interval;
  global_roas: Interval;
  per_region_share: Record<string, Interval>;
}

export interface HierDiagnostics {
  max_r_hat: number;
  n_divergences: number;
  r2_pooled: number;
  decomposition_ok: boolean;
}

export interface HierSummary {
  kind: "hierarchical";
  kpi: string;
  regions: string[];
  n_weeks: number;
  channels: HierChannelResult[];
  diagnostics: HierDiagnostics;
}

/** True when a stored `model_runs.summary` is a hierarchical (multi-region) result. */
export function isHierSummary(summary: unknown): summary is HierSummary {
  return Boolean(summary) && typeof summary === "object" && (summary as { kind?: unknown }).kind === "hierarchical";
}
