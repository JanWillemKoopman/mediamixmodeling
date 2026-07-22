import type { FitSummary, JobConfig, JobStatus, Interval, PriorPredictiveReview } from "@/lib/types";

// Turns a project's latest fit result (or failed/running job) into a compact Dutch text
// block for the architect, and decides which model should reason about it. Kept pure and
// free of Next/Supabase so it can be unit-smoke-tested in isolation.

export interface ArchitectFitContext {
  latestRun: { summary: FitSummary; created_at: string } | null;
  latestJob: { status: JobStatus; error: string | null; config: JobConfig; created_at: string } | null;
  // The latest prior-predictive review (KPI range implied by the priors), if one was run —
  // a cheap pre-fit sanity check the architect should read and act on before spending a fit.
  priorPredictive?: { review: PriorPredictiveReview; created_at: string } | null;
  // Up to a few runs BEFORE latestRun (newest first), each as a one-line digest — enough
  // for the architect to answer "is deze run beter dan de vorige, en waarom?" without
  // blowing up the context. Sits after the last cache breakpoint like the rest of this block.
  previousRuns?: { summary: FitSummary; created_at: string }[];
}

// The two roles the architect can reason in, and the single place their model IDs live —
// architect.ts imports these rather than hard-coding model names a second time. Model
// routing itself (which combines fit AND dataset context) lives in architect.ts, since
// that request-builder is the one place that sees both. Both roles currently point at the
// same model (claude-sonnet-5) to keep cost down; kept as two constants so either can be
// pointed at a stronger model again later without touching the routing logic.
export const ARCHITECT_CONFIG_MODEL = "claude-sonnet-5";
export const ARCHITECT_ANALYST_MODEL = "claude-sonnet-5";

// There is something to *reason about* (not just propose from scratch) when a fit has
// completed or a job has failed — that is when the analyst role kicks in.
export function hasFitResults(ctx: ArchitectFitContext): boolean {
  if (ctx.latestRun) return true;
  return ctx.latestJob?.status === "failed";
}

function pct(n: number | undefined): string {
  return n === undefined || Number.isNaN(n) ? "?" : `${(n * 100).toFixed(1)}%`;
}
function num(n: number | undefined, digits = 2): string {
  return n === undefined || Number.isNaN(n) ? "?" : n.toLocaleString("nl-NL", { maximumFractionDigits: digits });
}
function iv(x: Interval, render: (n: number) => string): string {
  return `${render(x.p50)} [${render(x.p3)}–${render(x.p97)}]`;
}

function formatModelShape(config: JobConfig): string {
  const m = config.model;
  const chans = m.channels
    .map((c) => `${c.name}(${c.channel_type ?? "generic"}/${c.adstock ?? "geometric"}/${c.saturation ?? "hill"})`)
    .join(", ");
  const parts = [
    `kpi=${m.kpi}`,
    `likelihood=${m.likelihood ?? "normal"}`,
    `trend=${m.add_trend === false ? "geen" : (m.trend_type ?? "linear")}`,
    `seizoen=${m.seasonality_periods ?? "uit"}`,
    m.control_columns && m.control_columns.length ? `controls=[${m.control_columns.join(", ")}]` : "controls=[]",
  ];
  return `${parts.join(", ")}; kanalen: ${chans}`;
}

function formatSummary(summary: FitSummary, createdAt: string): string {
  const d = summary.diagnostics;
  const gate = summary.quality_gate;
  const lines: string[] = [];
  lines.push(`Laatste fit (gedraaid ${createdAt.slice(0, 10)}) — KPI "${summary.kpi}", ${summary.n_weeks} weken (${summary.window[0]} t/m ${summary.window[1]}).`);
  if (gate) {
    lines.push(`Kwaliteitspoort: ${gate.verdict.toUpperCase()}${gate.reasons.length ? " — " + gate.reasons.join("; ") : "."}`);
  }
  lines.push(
    `Diagnostiek: R²=${num(d.r2)}, MAPE=${pct(d.mape)}, dekking(94%)=${pct(d.interval_coverage_94)}, ` +
      `max R-hat=${num(d.max_r_hat, 3)}, divergenties=${d.n_divergences}, decompositie-ok=${d.decomposition_ok ? "ja" : "nee"}.`,
  );
  lines.push(`Baseline (verkoop zonder marketing), mediaan: ${num(summary.baseline_contribution.p50, 0)} ${summary.kpi}.`);
  lines.push("Per kanaal (mediaan [p3–p97]):");
  for (const ch of summary.channels) {
    lines.push(
      `  • ${ch.name}: aandeel ${iv(ch.contribution_share, pct)}, ROAS ${iv(ch.roas, (n) => num(n))}, ` +
        `adstock-halfwaardetijd ${iv(ch.adstock_half_life_weeks, (n) => num(n, 1) + "wk")}, ` +
        `verzadigingspunt ${iv(ch.saturation_point, (n) => num(n, 0))}, totale spend ${num(ch.total_spend, 0)}` +
        (ch.direct_share ? `, direct-aandeel (zelfde week vs na-ijl) ${pct(ch.direct_share.p50)}` : "") +
        `.`,
    );
  }
  if (summary.optimal_allocation) {
    const oa = summary.optimal_allocation;
    const split = Object.entries(oa.per_channel).map(([k, v]) => `${k}=${num(v, 0)}`).join(", ");
    lines.push(
      `Budgetadvies bij zelfde weekbudget (${num(oa.total_weekly_budget, 0)}): ${split} → ` +
        `geschat ${num(oa.predicted_contribution.p50, 0)} ${summary.kpi}/wk.`,
    );
  }
  return lines.join("\n");
}

function formatPriorPredictive(pp: NonNullable<ArchitectFitContext["priorPredictive"]>): string {
  const r = pp.review;
  const lines = [
    `Prior-predictive check (${pp.created_at.slice(0, 10)}) — het KPI-bereik dat de priors ALLEEN impliceren, vóór er gefit is:`,
    `  Waargenomen KPI: ${num(r.observed_low, 0)}–${num(r.observed_high, 0)}. Prior-bereik: ${num(r.prior_low, 0)}–${num(r.prior_high, 0)}.`,
  ];
  if (r.ok) {
    lines.push("  Oordeel: de priors zijn plausibel (ze omvatten de data en zijn niet absurd breed). Groen licht om te fitten.");
  } else {
    if (!r.admits_observed)
      lines.push("  Oordeel: LET OP — de priors omvatten de waargenomen KPI niet; ze staan te strak. Verruim de relevante sigma('s) voordat je fit.");
    if (!r.not_absurdly_wide)
      lines.push("  Oordeel: LET OP — het prior-bereik is absurd breed (>20× de data); de priors zijn te weinig informatief. Verklein de relevante sigma('s).");
  }
  return lines.join("\n");
}

// One line per earlier run: enough to compare against the latest fit (quality trend,
// what changed in the config's effect) without repeating full per-channel tables.
function formatRunHistoryBlock(runs: NonNullable<ArchitectFitContext["previousRuns"]>): string {
  if (runs.length === 0) return "";
  const lines = runs.map((r) => {
    const s = r.summary;
    const d = s.diagnostics;
    const gate = s.quality_gate ? s.quality_gate.verdict.toUpperCase() : "?";
    const chans = s.channels.map((c) => `${c.name} ROAS ${num(c.roas.p50)}`).join(", ");
    return `  • ${r.created_at.slice(0, 10)}: poort=${gate}, R²=${num(d.r2)}, MAPE=${pct(d.mape)}, max R-hat=${num(d.max_r_hat, 3)}, div=${d.n_divergences}; ${chans}`;
  });
  return [
    "Eerdere runs van dit project (nieuwste eerst) — gebruik dit om de laatste fit te VERGELIJKEN met wat eraan voorafging (is het echt beter geworden, en waardoor?):",
    ...lines,
  ].join("\n");
}

export function formatFitContextBlock(ctx: ArchitectFitContext): string {
  const { latestRun, latestJob } = ctx;
  const historyBlock = ctx.previousRuns?.length ? `\n\n${formatRunHistoryBlock(ctx.previousRuns)}` : "";
  const ppBlock =
    (ctx.priorPredictive ? `\n\n${formatPriorPredictive(ctx.priorPredictive)}` : "") + historyBlock;

  // A failed job that is newer than the last successful run is the most relevant thing to
  // reason about (the builder just tried something and it broke).
  const jobFailedAndNewest =
    latestJob?.status === "failed" &&
    (!latestRun || new Date(latestJob.created_at) > new Date(latestRun.created_at));

  if (jobFailedAndNewest && latestJob) {
    return [
      `De laatste fit is MISLUKT (${latestJob.created_at.slice(0, 10)}).`,
      `Foutmelding: ${latestJob.error ?? "(geen melding opgeslagen)"}`,
      `Configuratie die faalde: ${formatModelShape(latestJob.config)}`,
      "Diagnosticeer de oorzaak en stel een concrete, aangepaste configuratie voor die dit oplost.",
    ].join("\n") + ppBlock;
  }

  if (latestRun) {
    let block = formatSummary(latestRun.summary, latestRun.created_at);
    if (latestJob && (latestJob.status === "queued" || latestJob.status === "running")) {
      block += `\n\nLet op: er draait/wacht nu ook een nieuwe fit (status: ${latestJob.status}).`;
    }
    return block + ppBlock;
  }

  if (latestJob && (latestJob.status === "queued" || latestJob.status === "running")) {
    return `Er draait nu een fit (status: ${latestJob.status}); er is nog geen afgerond resultaat om te bespreken.` + ppBlock;
  }

  if (ctx.priorPredictive) {
    return "Er is nog geen fit gedraaid, maar er is wel een prior-predictive check gedaan." + ppBlock;
  }
  return "Er is nog geen fit gedraaid voor dit project — er zijn nog geen resultaten om te bespreken.";
}
