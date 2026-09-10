// De toestandsruimte van het traject, opgespannen in plaats van steekproefsgewijs bezocht.
//
// Testen met een handvol scenario's bewijst iets over die scenario's. De invarianten uit
// docs/CHAT_PIPELINE_HERZIENING.md §8.2 moeten gelden voor élke toestand waarin een project
// kan verkeren — dus bouwen we ze allemaal: het product van de feiten die de flow leest.
//
// Bewust wordt hier NIET gefilterd op "logisch bereikbaar". Een project waarin de kolommen
// bevestigd zijn maar het grootboek geen doel kent, is via een handmatige database-ingreep
// of een half afgebroken migratie gewoon te maken. Faalt een invariant daar, dan is dat een
// echte bevinding en geen kunstmatig geval: de gebruiker mag ook in zo'n toestand nooit
// vastlopen. Alleen wat fysiek niet te construeren is (een gepubliceerd resultaat zonder
// run) wordt overgeslagen.

import type {
  DatasetStatus,
  DatasetVersion,
  ModelResult,
  ModelRun,
  ModelValidation,
  Project,
  ProjectSnapshot,
  RunView,
  SourceFile,
  ValidationLevel,
} from "@/lib/types";
import type { Ledger, StepDecision, StepId } from "@/lib/flow/steps";

export interface WorldSpec {
  goal: boolean;
  source: boolean;
  columnsConfirmed: boolean;
  /** null = nog geen datasetversie; "approved" = klaar én goedgekeurd. */
  dataset: null | DatasetStatus | "approved";
  beliefs: boolean;
  run: null | "running" | "failed" | "completed";
  level: ValidationLevel;
  published: boolean;
  resultsAcknowledged: boolean;
  /**
   * Optioneel: één stap die ná alles opnieuw is gedaan. Zo ontstaan de achterhaalde
   * toestanden die anders alleen in productie voorkomen.
   */
  redoneStep?: StepId;
}

// Een oplopende klok, zodat de volgorde van beslissingen betekenis heeft (veroudering
// volgt uit de tijden — zie lib/flow/state.ts).
const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
const at = (tick: number) => new Date(T0 + tick * 60_000).toISOString();

const TICK: Record<StepId, number> = {
  goal: 1,
  data: 2,
  columns: 3,
  prepare: 4,
  beliefs: 5,
  launch: 6,
  results: 7,
  share: 8,
};
/** Later dan élke normale stap: hiermee wordt een stap "opnieuw gedaan". */
const REDO_TICK = 100;

function project(): Project {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Testproject",
    client_company: null,
    status: "draft",
    created_by: null,
    created_at: at(0),
    published_at: null,
    kpi_margin: null,
  };
}

function sourceFile(spec: WorldSpec): SourceFile {
  const confirmedTick = spec.redoneStep === "columns" ? REDO_TICK : TICK.columns;
  return {
    id: "src-1",
    project_id: project().id,
    name: "verkoop.csv",
    storage_path: "p/verkoop.csv",
    preview: "week,omzet,tv\n2025-01-06,1000,50\n",
    profile: null,
    mapping: {
      granularity: "week",
      layout: "breed",
      currency: "EUR",
      reasoning: "",
      columns: [
        { name: "week", role: "date", meaning: "", unit: null, confidence: "hoog" },
        { name: "omzet", role: "kpi", meaning: "", unit: null, confidence: "hoog" },
        { name: "tv", role: "spend", meaning: "", unit: "currency", confidence: "hoog" },
      ],
    },
    inspection_confirmed_at: spec.columnsConfirmed ? at(confirmedTick) : null,
    content_sha256: "abc",
    size_bytes: 100,
    encoding: "utf-8",
    n_rows: 104,
    n_columns: 3,
    created_at: at(spec.redoneStep === "data" ? REDO_TICK : TICK.data),
  };
}

function datasetVersion(spec: WorldSpec): DatasetVersion | null {
  if (spec.dataset == null) return null;
  const approved = spec.dataset === "approved";
  const status: DatasetStatus = approved ? "ready" : (spec.dataset as DatasetStatus);
  const tick = spec.redoneStep === "prepare" ? REDO_TICK : TICK.prepare;
  return {
    id: "ds-1",
    project_id: project().id,
    version_no: 1,
    source_file_ids: ["src-1"],
    recipe: { sources: [{ source_file_id: "src-1", name: "verkoop", date_column: "week", columns: [] }] },
    status,
    master_path: approved ? "p/master.parquet" : null,
    master_sha256: approved ? "def" : null,
    window_start: "2025-01-06",
    window_end: "2025-12-29",
    n_weeks: 52,
    frequency: "W",
    column_roles: { omzet: "kpi", tv: "spend" },
    column_units: { tv: "currency" },
    column_notes: null,
    suitability: { issues: [] },
    verdict: "usable",
    preview: null,
    error_code: status === "failed" ? "MERGE_FAILED" : null,
    error_message: status === "failed" ? "De bronbestanden hebben geen overlappende periode." : null,
    created_at: at(tick),
    built_at: status === "ready" ? at(tick) : null,
    approved_at: approved ? at(tick) : null,
  };
}

function validation(level: ValidationLevel): ModelValidation {
  const allowed: Record<ValidationLevel, ModelValidation["allowed_outputs"]> = {
    not_usable: ["diagnostics"],
    technically_completed: ["diagnostics"],
    statistically_valid: ["diagnostics", "total_media_contribution", "channel_contributions", "publish"],
    usable_for_decisions: [
      "diagnostics",
      "total_media_contribution",
      "channel_contributions",
      "response_curves",
      "budget_advice",
      "publish",
    ],
  };
  return {
    model_run_id: "run-1",
    level,
    ruleset_version: "2024.2",
    allowed_outputs: allowed[level],
    blocking_reasons: level === "not_usable" ? ["De berekening is niet stabiel geworden."] : [],
    warning_reasons: [],
    checks: [],
    per_channel: [{ name: "tv", usable: level !== "not_usable", reasons: [] }],
    inseparable_groups: [],
  };
}

function runView(spec: WorldSpec): RunView | null {
  if (spec.run == null) return null;
  const tick = spec.redoneStep === "launch" ? REDO_TICK : TICK.launch;
  const state: ModelRun["state"] =
    spec.run === "running" ? "sampling" : spec.run === "failed" ? "failed" : "completed";
  const run: ModelRun = {
    id: "run-1",
    project_id: project().id,
    model_configuration_id: "cfg-1",
    dataset_version_id: "ds-1",
    state,
    state_changed_at: at(tick),
    attempt: 1,
    max_attempts: 3,
    cancel_requested: false,
    seed: 0,
    sample_params: { draws: 1000, tune: 1000, chains: 4 },
    dataset_sha256: "def",
    spec_sha256: "ghi",
    mmm_core_version: "2.0.0",
    package_versions: null,
    error_code: spec.run === "failed" ? "SAMPLING_FAILED" : null,
    error_message: spec.run === "failed" ? "De berekening is niet stabiel geworden." : null,
    created_at: at(tick),
    started_at: at(tick),
    finished_at: spec.run === "running" ? null : at(tick),
  };
  if (spec.run !== "completed") return { run, result: null, validation: null };

  const result: ModelResult = {
    model_run_id: run.id,
    project_id: run.project_id,
    // De cijfers zelf doen er voor de flow-invarianten niet toe: wat telt is of ze
    // getóónd mogen worden, en dat bepaalt het oordeel hiernaast.
    summary: {
      kpi: "omzet",
      kpi_type: "revenue",
      n_weeks: 52,
      window: ["2025-01-06", "2025-12-29"],
      baseline_contribution: { p3: 100, p50: 120, p97: 140 },
      channels: [],
      diagnostics: {
        max_r_hat: 1.01,
        min_ess_bulk: 900,
        min_ess_tail: 800,
        n_divergences: 0,
        min_e_bfmi: 0.9,
        n_max_treedepth: 0,
        r2: 0.8,
        mape: 0.1,
        interval_coverage_94: 0.94,
        interval_coverage_80: 0.8,
        interval_coverage_50: 0.5,
        residual_autocorrelation: 0.05,
        decomposition_ok: true,
      },
      draws: 1000,
      chains: 4,
      validation: null,
      identifiability: [],
    },
    inference_data_path: null,
    analysis: null,
    client_summary: null,
    is_published: spec.published,
    published_at: spec.published ? at(TICK.share) : null,
    created_at: at(tick),
  };
  return { run, result, validation: validation(spec.level) };
}

// Wat er in een beslissing moet staan om de stap ook écht af te maken. Een leeg
// beslissingsobject leek lang goed genoeg, maar stap 1 is pas af als er een kpi_type in
// staat — met `decision: {}` stond de gebruiker in ELKE gegenereerde wereld nog op stap 1,
// en toetsten de invarianten dus nergens iets over de zeven stappen daarna.
const DECISION: Partial<Record<StepId, Record<string, unknown>>> = {
  goal: { aim: "effect", kpi_type: "orders" },
};

function ledgerEntry(step: StepId, spec: WorldSpec): StepDecision {
  return {
    step,
    decision: DECISION[step] ?? {},
    summary: `besluit voor ${step}`,
    decided_at: at(spec.redoneStep === step ? REDO_TICK : TICK[step]),
    decided_by: null,
  };
}

export function buildWorld(spec: WorldSpec): { snapshot: ProjectSnapshot; ledger: Ledger } {
  const src = spec.source ? sourceFile(spec) : null;
  const ds = datasetVersion(spec);
  const view = runView(spec);

  const snapshot: ProjectSnapshot = {
    project: project(),
    sources: src ? [src] : [],
    dataset: ds,
    approvedDataset: ds?.approved_at ? ds : null,
    configuration: null,
    runs: view ? [view] : [],
    context: null,
    inspection: null,
  };

  const ledger: Ledger = {};
  if (spec.goal) ledger.goal = ledgerEntry("goal", spec);
  if (spec.beliefs) ledger.beliefs = ledgerEntry("beliefs", spec);
  if (spec.resultsAcknowledged) ledger.results = ledgerEntry("results", spec);

  return { snapshot, ledger };
}

/** Kan deze combinatie überhaupt bestaan als rijen in de database? */
function constructible(spec: WorldSpec): boolean {
  // Een gepubliceerd resultaat hoort bij een afgeronde run — anders is er geen rij om te
  // publiceren. Alle andere ongerijmdheden zijn wél te construeren en dus te toetsen.
  if (spec.published && spec.run !== "completed") return false;
  // Kolommen kunnen niet bevestigd zijn zonder bestand: het vinkje staat op die rij.
  if (spec.columnsConfirmed && !spec.source) return false;
  return true;
}

const DATASETS: WorldSpec["dataset"][] = [null, "queued", "building", "failed", "ready", "approved"];
const RUNS: WorldSpec["run"][] = [null, "running", "failed", "completed"];
const LEVELS: ValidationLevel[] = [
  "not_usable",
  "technically_completed",
  "statistically_valid",
  "usable_for_decisions",
];

/** Elke toestand die de flow kan aannemen. */
export function allWorlds(): { spec: WorldSpec; snapshot: ProjectSnapshot; ledger: Ledger }[] {
  const out: { spec: WorldSpec; snapshot: ProjectSnapshot; ledger: Ledger }[] = [];
  for (const goal of [false, true])
    for (const source of [false, true])
      for (const columnsConfirmed of [false, true])
        for (const dataset of DATASETS)
          for (const beliefs of [false, true])
            for (const run of RUNS)
              for (const level of run === "completed" ? LEVELS : (["statistically_valid"] as ValidationLevel[]))
                for (const published of run === "completed" ? [false, true] : [false])
                  for (const resultsAcknowledged of [false, true]) {
                    const spec: WorldSpec = {
                      goal,
                      source,
                      columnsConfirmed,
                      dataset,
                      beliefs,
                      run,
                      level,
                      published,
                      resultsAcknowledged,
                    };
                    if (!constructible(spec)) continue;
                    out.push({ spec, ...buildWorld(spec) });
                  }
  return out;
}

/** Toestanden waarin één stap ná de rest opnieuw is gedaan — de achterhaalde gevallen. */
export function staleWorlds(): { spec: WorldSpec; snapshot: ProjectSnapshot; ledger: Ledger }[] {
  const base: WorldSpec = {
    goal: true,
    source: true,
    columnsConfirmed: true,
    dataset: "approved",
    beliefs: true,
    run: "completed",
    level: "usable_for_decisions",
    published: false,
    resultsAcknowledged: true,
  };
  return (["goal", "data", "columns", "prepare", "beliefs"] as StepId[]).map((redoneStep) => {
    const spec = { ...base, redoneStep };
    return { spec, ...buildWorld(spec) };
  });
}

/** Leesbare naam van een toestand, zodat een gefaalde test meteen zegt wélke. */
export function describeWorld(spec: WorldSpec): string {
  return [
    spec.goal ? "doel" : "-",
    spec.source ? "bestand" : "-",
    spec.columnsConfirmed ? "kolommen" : "-",
    spec.dataset ?? "geen dataset",
    spec.beliefs ? "verwachtingen" : "-",
    spec.run ?? "geen run",
    spec.run === "completed" ? spec.level : "-",
    spec.published ? "gedeeld" : "-",
    spec.resultsAcknowledged ? "uitkomst gezien" : "-",
    spec.redoneStep ? `opnieuw:${spec.redoneStep}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
