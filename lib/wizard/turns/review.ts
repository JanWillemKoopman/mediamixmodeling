// Fase "review"/"published" — het oordeel eerst, dan pas de cijfers.
//
// De volgorde is het hele punt. In v1 stond hier de uitkomst, met het kwaliteitsoordeel
// ergens eronder als badge en zonder enig gevolg: een berekening die de poort niet haalde
// kon gewoon gepubliceerd worden, mét budgetadvies. Nu bepaalt het oordeel wat er te zien is
// en wat er te doen valt.

import { humanizeError } from "@/lib/humanizeMessage";
import { postJson } from "@/lib/fetchJson";
import { formatMenu, matchOption, type MenuOption } from "@/lib/wizard/questions";
import {
  VALIDATION_LEVEL_LABEL,
  allows,
  type ClientSummary,
  type FitSummary,
  type ModelValidation,
  type RunAnalysis,
  type RunView,
} from "@/lib/types";
import type { TurnEnv, TurnReplyResult } from "@/lib/wizard/turns/types";

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("nl-NL", { maximumFractionDigits: digits });
}
function pct(n: number): string {
  return (n * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 }) + "%";
}
function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export interface ReviewPhaseState {
  viewedRunId?: string;
}

/** The run currently being looked at — the newest by default. */
export function viewedRun(env: TurnEnv): RunView | null {
  const state = (env.phaseState as ReviewPhaseState | null) ?? {};
  return env.runs.find((r) => r.run.id === state.viewedRunId) ?? env.runs[0] ?? null;
}

function formatVerdict(validation: ModelValidation | null): string {
  if (!validation) {
    return "Deze berekening is nog niet beoordeeld.";
  }
  const lines = [`**${VALIDATION_LEVEL_LABEL[validation.level]}**`];
  if (validation.blocking_reasons.length > 0) {
    lines.push("", "Wat er niet klopt:");
    lines.push(...validation.blocking_reasons.map((r) => `- ${r}`));
  }
  if (validation.warning_reasons.length > 0) {
    lines.push("", "Aandachtspunten:");
    lines.push(...validation.warning_reasons.map((r) => `- ${r}`));
  }
  const unusable = validation.per_channel.filter((c) => !c.usable);
  if (unusable.length > 0) {
    lines.push("", "Voor deze kanalen kan ik geen apart cijfer geven:");
    lines.push(...unusable.map((c) => `- **${c.name}**: ${c.reasons.join("; ")}`));
  }
  if (validation.inseparable_groups.length > 0) {
    lines.push(
      "",
      "Deze kanalen zijn alleen samen te beoordelen — hun totaal klopt, de verdeling ertussen niet:",
    );
    lines.push(...validation.inseparable_groups.map((g) => `- ${g.join(" + ")}`));
  }
  if (!allows(validation, "budget_advice")) {
    lines.push(
      "",
      "_Er komt geen budgetadvies uit deze berekening: dat vraagt om een model waarvan we " +
        "hebben vastgesteld dat het ook op weken die het niet gezien heeft klopt._",
    );
  }
  return lines.join("\n");
}

function formatRunList(runs: RunView[]): string {
  if (runs.length <= 1) return "";
  const lines = runs.map((r, i) => {
    const level = r.validation ? VALIDATION_LEVEL_LABEL[r.validation.level] : r.run.state;
    const summary = r.result?.summary;
    const metrics = summary
      ? ` · R² ${fmt(summary.diagnostics.r2, 2)}`
      : r.run.error_message
        ? " · mislukt"
        : "";
    return `${i + 1}. ${dateLabel(r.run.created_at)} — ${level}${metrics}${
      r.result?.is_published ? " · gepubliceerd" : ""
    }`;
  });
  return (
    `Eerdere berekeningen:\n${lines.join("\n")}\n\n` +
    "Typ **toon run <nummer>** om er een te bekijken, **vergelijk <n> en <m>** om er twee " +
    "naast elkaar te zetten, of **gebruik afstemming van run <nummer>** om daarmee opnieuw te beginnen.\n"
  );
}

function formatCompare(a: RunView, b: RunView): string {
  const sa = a.result?.summary;
  const sb = b.result?.summary;
  if (!sa || !sb) return "Van minstens één van deze berekeningen is er geen resultaat om te vergelijken.";
  const names = Array.from(new Set([...sa.channels.map((c) => c.name), ...sb.channels.map((c) => c.name)]));
  return [
    `| | ${dateLabel(a.run.created_at)} | ${dateLabel(b.run.created_at)} |`,
    "|---|---|---|",
    `| Oordeel | ${a.validation ? VALIDATION_LEVEL_LABEL[a.validation.level] : "?"} | ${b.validation ? VALIDATION_LEVEL_LABEL[b.validation.level] : "?"} |`,
    `| R² | ${fmt(sa.diagnostics.r2, 2)} | ${fmt(sb.diagnostics.r2, 2)} |`,
    `| Voorspelfout | ${sa.diagnostics.mape == null ? "—" : pct(sa.diagnostics.mape)} | ${sb.diagnostics.mape == null ? "—" : pct(sb.diagnostics.mape)} |`,
    ...names.map((name) => {
      const ca = sa.channels.find((c) => c.name === name);
      const cb = sb.channels.find((c) => c.name === name);
      return `| ${name} — aandeel | ${ca ? pct(ca.contribution_share.p50) : "—"} | ${cb ? pct(cb.contribution_share.p50) : "—"} |`;
    }),
  ].join("\n");
}

function actionOptions(env: TurnEnv, view: RunView, isLatest: boolean): MenuOption[] {
  const options: MenuOption[] = [];
  const validation = view.validation;
  if (isLatest && view.result) {
    if (allows(validation, "channel_contributions")) {
      options.push({
        key: "analysis",
        label: view.result.analysis ? "Analyse opnieuw genereren" : "Analyse genereren",
        synonyms: ["analyse"],
      });
      options.push({
        key: "summary",
        label: view.result.client_summary ? "Samenvatting opnieuw schrijven" : "Samenvatting schrijven",
        synonyms: ["samenvatting"],
      });
    }
    if (validation && validation.level !== "usable_for_decisions") {
      options.push({ key: "refine", label: "Laat de AI dit verbeteren", synonyms: ["verbeter", "refine"] });
    }
  }
  if (view.result && !view.result.is_published && allows(validation, "publish")) {
    options.push({ key: "publish", label: "Publiceer naar het klantdashboard", synonyms: ["publiceer", "publiceren"] });
  }
  return options;
}

export function intro(env: TurnEnv): string {
  const view = viewedRun(env);
  if (!view) return "";
  const isLatest = view.run.id === env.runs[0]?.run.id;
  const parts = [formatVerdict(view.validation), formatRunList(env.runs)];
  if (view.result?.is_published) parts.push("Deze berekening staat op het klantdashboard.");
  const options = actionOptions(env, view, isLatest);
  if (options.length > 0) parts.push(formatMenu(options));
  return parts.filter(Boolean).join("\n\n");
}

export async function resolve(env: TurnEnv, reply: string): Promise<TurnReplyResult> {
  const view = viewedRun(env);
  if (!view) return { handled: false };

  const show = reply.match(/^(?:toon|bekijk)\s+run\s*(\d+)/i);
  if (show) {
    const target = env.runs[Number(show[1]) - 1];
    if (!target) return { handled: true, reply: `Ik heb geen run ${show[1]} — er zijn er ${env.runs.length}.` };
    env.setPhaseState({ viewedRunId: target.run.id } satisfies ReviewPhaseState);
    return { handled: true, reply: `Je bekijkt nu run ${show[1]} (${dateLabel(target.run.created_at)}).` };
  }

  const compare = reply.match(/vergelijk\s+(\d+)\D+(\d+)/i);
  if (compare) {
    const a = env.runs[Number(compare[1]) - 1];
    const b = env.runs[Number(compare[2]) - 1];
    if (!a || !b) return { handled: true, reply: `Ik kan die twee niet vinden — er zijn ${env.runs.length} runs.` };
    return { handled: true, reply: formatCompare(a, b) };
  }

  const reuse = reply.match(/gebruik\s+(?:afstemming|config(?:uratie)?)\s+van\s+run\s*(\d+)/i);
  if (reuse) {
    const target = env.runs[Number(reuse[1]) - 1];
    if (!target) return { handled: true, reply: "Die berekening ken ik niet." };
    const res = await fetch(
      `/api/model-configurations/${target.run.model_configuration_id}`,
    ).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!res?.intent) return { handled: true, reply: "Van die berekening ken ik de afstemming niet meer." };
    env.setReuseIntent(res.intent);
    env.goToPhase("tuning", `de afstemming van run ${reuse[1]} als startpunt`);
    return { handled: true, reply: `Ik gebruik de afstemming van run ${reuse[1]} als startpunt.` };
  }

  const isLatest = view.run.id === env.runs[0]?.run.id;
  const match = matchOption(reply, actionOptions(env, view, isLatest));
  if (!match) return { handled: false };

  if (match.key === "publish") {
    const res = await postJson(`/api/projects/${env.projectId}/publish`, { model_run_id: view.run.id });
    if (!res.ok) {
      return { handled: true, reply: humanizeError(res.error, "Publiceren is niet gelukt.").text };
    }
    return { handled: true, refresh: true, reply: "Gepubliceerd! De klant ziet nu dit resultaat." };
  }

  if (match.key === "refine") {
    const res = await postJson<{ status: string; message?: string; reasoning?: string; intent?: unknown }>(
      "/api/fit-refine",
      { project_id: env.projectId },
    );
    if (!res.ok) {
      return { handled: true, reply: humanizeError(res.error, "De AI kon geen verbetering voorstellen.").text };
    }
    if (res.data.status === "proposed") {
      // A proposal, not an action: the user applies it, which runs the same validation and
      // the same prior gate as any other configuration.
      return {
        handled: true,
        reply:
          `${res.data.reasoning ?? "Ik heb een aangepaste afstemming."}\n\n` +
          `Typ "ja" om hiermee opnieuw te rekenen, of beschrijf wat er anders moet.`,
        proposal: { kind: "intent", payload: res.data.intent },
      };
    }
    return { handled: true, reply: res.data.message ?? "Geen verdere verbetering mogelijk." };
  }

  if (match.key === "analysis") {
    const res = await postJson<{ analysis: RunAnalysis }>("/api/analysis", {
      project_id: env.projectId,
      model_run_id: view.run.id,
    });
    if (!res.ok || !res.data.analysis) {
      return { handled: true, reply: humanizeError(res.error, "Het genereren van de analyse is niet gelukt.").text };
    }
    return { handled: true, refresh: true, reply: "Analyse gegenereerd — je ziet 'm hieronder." };
  }

  if (match.key === "summary") {
    const res = await postJson<{ client_summary: ClientSummary }>("/api/client-summary", {
      project_id: env.projectId,
      model_run_id: view.run.id,
    });
    if (!res.ok || !res.data.client_summary) {
      return { handled: true, reply: humanizeError(res.error, "Het schrijven van de samenvatting is niet gelukt.").text };
    }
    return { handled: true, refresh: true, reply: res.data.client_summary.text };
  }

  return { handled: false };
}

/** The summary of the run being viewed, when the verdict allows showing it. */
export function viewedSummary(env: TurnEnv): FitSummary | null {
  const view = viewedRun(env);
  if (!view?.result) return null;
  return allows(view.validation, "channel_contributions") ? view.result.summary : null;
}
