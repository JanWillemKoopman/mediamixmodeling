import type {
  ChannelResult,
  FitSummary,
  Interval,
  ModelValidation,
  RunErrorCode,
} from "@/lib/types";

// Turns a project's latest fit result (or failed/running job) into a compact Dutch text
// block for the architect, and decides which model should reason about it. Kept pure and
// free of Next/Supabase so it can be unit-smoke-tested in isolation.

export interface ArchitectFitContext {
  latestRun: { summary: FitSummary; created_at: string } | null;
  /** The lifecycle state of the newest run, whether or not it produced a result. */
  latestRunState?: {
    state: string;
    error_code: RunErrorCode | null;
    /** Already plain language — the worker never puts a traceback in this field. */
    error_message: string | null;
    created_at: string;
  } | null;
  /** The verdict on the newest run: the level, the reasons, and what it is allowed to show. */
  validation?: ModelValidation | null;
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
  return ctx.latestRunState?.state === "failed";
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

// A channel's return, worded for its unit. Only a currency channel has a ROAS; calling
// "KPI per e-mail sent" a ROAS invites it to be compared with, or traded against, euros.
function describeReturn(ch: ChannelResult): string {
  if (!ch.roas) return "geen uitgaven in deze periode";
  if (ch.unit === "currency") return `ROAS ${iv(ch.roas, (n) => num(n))}`;
  return `${iv(ch.roas, (n) => num(n, 4))} per ${ch.unit}`;
}

function formatSummary(summary: FitSummary, createdAt: string): string {
  const d = summary.diagnostics;
  const lines: string[] = [];
  lines.push(
    `Laatste berekening (${createdAt.slice(0, 10)}) — KPI "${summary.kpi}", ${summary.n_weeks} ` +
      `weken (${summary.window[0]} t/m ${summary.window[1]})` +
      (summary.weekly?.burn_in_weeks
        ? `; de eerste ${summary.weekly.burn_in_weeks} weken bouwden alleen de na-ijl op en tellen niet mee.`
        : "."),
  );
  lines.push(
    `Diagnostiek: R²=${num(d.r2)}, MAPE=${pct(d.mape ?? undefined)}, ` +
      `dekking 94/80/50%=${pct(d.interval_coverage_94)}/${pct(d.interval_coverage_80)}/${pct(d.interval_coverage_50)}, ` +
      `max R-hat=${num(d.max_r_hat, 3)}, divergenties=${d.n_divergences}, ` +
      `restsamenhang=${num(d.residual_autocorrelation ?? undefined)}, ` +
      `decompositie-ok=${d.decomposition_ok ? "ja" : "nee"}.`,
  );
  lines.push(`Baseline (verkoop zonder marketing), mediaan: ${num(summary.baseline_contribution.p50, 0)} ${summary.kpi}.`);
  lines.push("Per kanaal (mediaan [p3–p97]):");
  const identifiability = new Map(summary.identifiability.map((c) => [c.name, c]));
  for (const ch of summary.channels) {
    const id = identifiability.get(ch.name);
    lines.push(
      `  • ${ch.name} (${ch.unit}): aandeel ${iv(ch.contribution_share, pct)}, ${describeReturn(ch)}, ` +
        `na-ijl-halfwaardetijd ${iv(ch.adstock_half_life_weeks, (n) => num(n, 1) + "wk")}, ` +
        `verzadigingspunt ${iv(ch.saturation_point, (n) => num(n, 0))}, totale druk ${num(ch.total_spend, 0)}` +
        (ch.direct_share ? `, direct-aandeel ${pct(ch.direct_share.p50)}` : "") +
        (id && id.verdict !== "identified"
          ? ` — LET OP, dit kanaal is ${id.verdict === "not_identified" ? "NIET" : "zwak"} apart vast te stellen: ${id.reasons.join("; ")}`
          : "") +
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

// The verdict, in the architect's context. This is what it must reason from before saying
// anything about the result: a model at "technically_completed" has finished computing and
// nothing more, and the architect may not talk about its channel numbers as findings.
function formatValidation(v: ModelValidation): string {
  const lines = [
    `Beoordeling van deze berekening: ${v.level.toUpperCase()} (regelset ${v.ruleset_version}).`,
    `Wat er op grond hiervan getoond mag worden: ${v.allowed_outputs.join(", ") || "alleen diagnostiek"}.`,
  ];
  if (v.blocking_reasons.length) {
    lines.push("BLOKKEREND:", ...v.blocking_reasons.map((r) => `  • ${r}`));
  }
  if (v.warning_reasons.length) {
    lines.push("Aandachtspunten:", ...v.warning_reasons.map((r) => `  • ${r}`));
  }
  const unusable = v.per_channel.filter((c) => !c.usable);
  if (unusable.length) {
    lines.push(
      "Kanalen waarvoor GEEN apart cijfer gegeven mag worden (noem ze niet als losse " +
        "uitkomst, leg uit waarom niet):",
      ...unusable.map((c) => `  • ${c.name}: ${c.reasons.join("; ")}`),
    );
  }
  if (v.inseparable_groups.length) {
    lines.push(
      "Kanalen die alleen SAMEN te beoordelen zijn (hun som is wel betrouwbaar, de verdeling " +
        "ertussen niet):",
      ...v.inseparable_groups.map((g) => `  • ${g.join(" + ")}`),
    );
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
    const level = s.validation ? s.validation.level : "?";
    const chans = s.channels.map((c) => `${c.name} ${describeReturn(c)}`).join(", ");
    return `  • ${r.created_at.slice(0, 10)}: oordeel=${level}, R²=${num(d.r2)}, MAPE=${pct(d.mape ?? undefined)}, max R-hat=${num(d.max_r_hat, 3)}, div=${d.n_divergences}; ${chans}`;
  });
  return [
    "Eerdere runs van dit project (nieuwste eerst) — gebruik dit om de laatste fit te VERGELIJKEN met wat eraan voorafging (is het echt beter geworden, en waardoor?):",
    ...lines,
  ].join("\n");
}

export function formatFitContextBlock(ctx: ArchitectFitContext): string {
  const { latestRun, latestRunState, validation } = ctx;
  const historyBlock = ctx.previousRuns?.length ? `\n\n${formatRunHistoryBlock(ctx.previousRuns)}` : "";
  // The verdict comes FIRST, before any numbers. An architect that reads the channel table
  // before it reads "this model is not usable" will discuss the numbers as findings.
  const verdictBlock = validation ? `${formatValidation(validation)}\n\n` : "";

  const failedAndNewest =
    latestRunState?.state === "failed" &&
    (!latestRun || new Date(latestRunState.created_at) >= new Date(latestRun.created_at));

  if (failedAndNewest && latestRunState) {
    return [
      `De laatste berekening is MISLUKT (${latestRunState.created_at.slice(0, 10)}).`,
      `Reden (${latestRunState.error_code ?? "onbekend"}): ${latestRunState.error_message ?? "(geen melding opgeslagen)"}`,
      "Diagnosticeer de oorzaak en stel een aangepaste modelintentie voor die dit oplost.",
    ].join("\n") + historyBlock;
  }

  const running = latestRunState && !["completed", "failed", "cancelled"].includes(latestRunState.state);
  if (latestRun) {
    let block = verdictBlock + formatSummary(latestRun.summary, latestRun.created_at);
    if (running) {
      block += `\n\nLet op: er draait nu ook een nieuwe berekening (${latestRunState?.state}).`;
    }
    return block + historyBlock;
  }

  if (running) {
    return `Er draait nu een berekening (${latestRunState?.state}); er is nog geen afgerond resultaat om te bespreken.`;
  }
  return "Er is nog geen berekening gedraaid voor dit project — er zijn nog geen resultaten om te bespreken.";
}
