// Fase "review"/"published" — resultaten + publiceren. Vervangt ReviewCard én RunHistory:
// de fitgeschiedenis wordt een tekstlijst, vergelijken en "config hergebruiken" worden
// getypte commando's, en alle acties (analyse, samenvatting, publiceren, auto-verbeteren)
// worden genummerde menu-items i.p.v. knoppen. SummaryView/HierarchicalSummaryView blijven
// gewoon de read-only resultaatweergave (grafieken/tabellen, geen invoervelden) onder de
// bubbel — dat is geen formulier, dus geen probleem voor "alles via chat".

import { humanizeError } from "@/lib/humanizeMessage";
import { postJson } from "@/lib/fetchJson";
import { formatMenu, matchOption, type MenuOption } from "@/lib/wizard/questions";
import { isHierSummary, type ClientSummary, type FitSummary, type ModelRun, type RunAnalysis } from "@/lib/types";
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
function verdictLabel(run: ModelRun): string {
  const verdict = run.summary?.quality_gate?.verdict;
  if (verdict === "fail") return "niet betrouwbaar";
  if (verdict === "warn") return "let op";
  return "geslaagd";
}

export interface ReviewPhaseState {
  viewedRunId?: string;
}

function formatRunList(runs: ModelRun[]): string {
  if (runs.length <= 1) return "";
  const lines = runs.map((r, i) => {
    if (isHierSummary(r.summary)) return `${i + 1}. ${dateLabel(r.created_at)} — hiërarchisch (${r.summary.regions.length} regio's)`;
    const s = r.summary as FitSummary;
    return `${i + 1}. ${dateLabel(r.created_at)} — R² ${fmt(s.diagnostics.r2, 2)} · MAPE ${pct(s.diagnostics.mape)} · ${verdictLabel(r)}${r.is_published ? " · gepubliceerd" : ""}`;
  });
  return (
    `Eerdere berekeningen:\n${lines.join("\n")}\n\n` +
    "Typ **toon run <nummer>** om er een te bekijken, **vergelijk <n> en <m>** om er twee naast elkaar te zetten, " +
    "of **gebruik config van run <nummer>** om met die instellingen opnieuw te tunen.\n"
  );
}

function formatCompareTable(a: ModelRun, b: ModelRun): string | null {
  if (isHierSummary(a.summary) || isHierSummary(b.summary)) return "Hiërarchische runs kunnen niet vergeleken worden.";
  const sa = a.summary as FitSummary;
  const sb = b.summary as FitSummary;
  const names = Array.from(new Set([...sa.channels.map((c) => c.name), ...sb.channels.map((c) => c.name)]));
  const rows = [
    `| | ${dateLabel(a.created_at)} | ${dateLabel(b.created_at)} |`,
    "|---|---|---|",
    `| R² | ${fmt(sa.diagnostics.r2, 2)} | ${fmt(sb.diagnostics.r2, 2)} |`,
    `| MAPE | ${pct(sa.diagnostics.mape)} | ${pct(sb.diagnostics.mape)} |`,
    `| Max R-hat | ${fmt(sa.diagnostics.max_r_hat, 2)} | ${fmt(sb.diagnostics.max_r_hat, 2)} |`,
    ...names.map((name) => {
      const ca = sa.channels.find((c) => c.name === name);
      const cb = sb.channels.find((c) => c.name === name);
      return `| ${name} — aandeel | ${ca ? pct(ca.contribution_share.p50) : "—"} | ${cb ? pct(cb.contribution_share.p50) : "—"} |`;
    }),
  ];
  return rows.join("\n");
}

function actionOptions(env: TurnEnv, latestRun: ModelRun, isLatestViewed: boolean): MenuOption[] {
  const options: MenuOption[] = [];
  if (isLatestViewed && !isHierSummary(latestRun.summary)) {
    options.push({
      key: "analysis",
      label: latestRun.analysis ? "Analyse opnieuw genereren" : "Analyse genereren",
      synonyms: ["analyse"],
    });
    options.push({
      key: "summary",
      label: latestRun.client_summary ? "Samenvatting opnieuw schrijven" : "Samenvatting schrijven",
      synonyms: ["samenvatting"],
    });
    const gate = latestRun.summary.quality_gate?.verdict;
    if (gate === "warn" || gate === "fail") {
      options.push({ key: "refine", label: "Laat de AI dit verbeteren", synonyms: ["verbeter", "refine"] });
    }
  }
  if (!latestRun.is_published) {
    options.push({ key: "publish", label: "Publiceer naar het klantdashboard", synonyms: ["publiceer", "publiceren"] });
  }
  return options;
}

export function intro(env: TurnEnv): string {
  if (env.runs.length === 0) return "";
  const latestRun = env.runs[0];
  const state = (env.phaseState as ReviewPhaseState | null) ?? {};
  const viewedRun = env.runs.find((r) => r.id === state.viewedRunId) ?? latestRun;
  const options = actionOptions(env, latestRun, viewedRun.id === latestRun.id);
  const parts = [formatRunList(env.runs)];
  if (latestRun.is_published) parts.push("Deze run staat op het klantdashboard.");
  if (options.length > 0) parts.push(formatMenu(options));
  return parts.filter(Boolean).join("\n\n");
}

export function viewedRun(env: TurnEnv): ModelRun {
  const state = (env.phaseState as ReviewPhaseState | null) ?? {};
  return env.runs.find((r) => r.id === state.viewedRunId) ?? env.runs[0];
}

export async function resolve(env: TurnEnv, reply: string): Promise<TurnReplyResult> {
  if (env.runs.length === 0) return { handled: false };
  const latestRun = env.runs[0];

  const showMatch = reply.match(/^(?:toon|bekijk)\s+run\s*(\d+)/i);
  if (showMatch) {
    const idx = Number(showMatch[1]) - 1;
    const run = env.runs[idx];
    if (!run) return { handled: true, reply: `Ik heb geen run ${showMatch[1]} — er zijn ${env.runs.length} runs.` };
    env.setPhaseState({ viewedRunId: run.id } satisfies ReviewPhaseState);
    return { handled: true, reply: `Je bekijkt nu run ${showMatch[1]} (${dateLabel(run.created_at)}).` };
  }

  const compareMatch = reply.match(/vergelijk\s+(\d+)\D+(\d+)/i);
  if (compareMatch) {
    const a = env.runs[Number(compareMatch[1]) - 1];
    const b = env.runs[Number(compareMatch[2]) - 1];
    if (!a || !b) return { handled: true, reply: `Ik kan die twee runs niet vinden — er zijn ${env.runs.length} runs.` };
    const table = formatCompareTable(a, b);
    return { handled: true, reply: table ?? "Deze runs kunnen niet vergeleken worden." };
  }

  const reuseMatch = reply.match(/gebruik\s+config\s+van\s+run\s*(\d+)/i);
  if (reuseMatch) {
    const run = env.runs[Number(reuseMatch[1]) - 1];
    const config = run?.job_id ? env.jobConfigs[run.job_id] : undefined;
    if (!config) return { handled: true, reply: "Van die run ken ik de configuratie niet meer." };
    env.setReuseJobConfig(config);
    env.goToPhase("tuning", `de configuratie van run ${reuseMatch[1]} als startpunt`);
    return { handled: true, reply: `Ik gebruik de configuratie van run ${reuseMatch[1]} als startpunt in de tuning-stap.` };
  }

  const options = actionOptions(env, latestRun, viewedRun(env).id === latestRun.id);
  const match = matchOption(reply, options);
  if (!match) return { handled: false };

  if (match.key === "publish") {
    const res = await postJson(`/api/projects/${env.projectId}/publish`, { model_run_id: viewedRun(env).id });
    if (!res.ok) return { handled: true, reply: humanizeError(res.error, "Publiceren is niet gelukt — probeer het opnieuw.").text };
    return { handled: true, refresh: true, reply: "Gepubliceerd! De klant ziet nu het dashboard met dit resultaat." };
  }
  if (match.key === "refine") {
    const res = await postJson<{ status?: string; message?: string; reasoning?: string }>("/api/fit-refine", {
      project_id: env.projectId,
      round: 1,
    });
    if (!res.ok) return { handled: true, reply: humanizeError(res.error, "De automatische verbetering is niet gelukt.").text };
    if (res.data.status === "refitted") {
      return {
        handled: true,
        refresh: true,
        reply: res.data.reasoning ? `Een gecorrigeerde berekening is gestart. ${res.data.reasoning}` : "Een gecorrigeerde berekening is gestart.",
      };
    }
    return { handled: true, reply: res.data.message ?? "Geen verdere verbetering mogelijk." };
  }
  if (match.key === "analysis") {
    const res = await postJson<{ analysis: RunAnalysis }>("/api/analysis", { project_id: env.projectId, model_run_id: latestRun.id });
    if (!res.ok || !res.data.analysis) return { handled: true, reply: humanizeError(res.error, "Het genereren van de analyse is niet gelukt.").text };
    return { handled: true, refresh: true, reply: "Analyse gegenereerd — je ziet 'm hieronder." };
  }
  if (match.key === "summary") {
    const res = await postJson<{ client_summary: ClientSummary }>("/api/client-summary", { project_id: env.projectId, model_run_id: latestRun.id });
    if (!res.ok || !res.data.client_summary) return { handled: true, reply: humanizeError(res.error, "Het schrijven van de samenvatting is niet gelukt.").text };
    return { handled: true, refresh: true, reply: res.data.client_summary.text };
  }
  return { handled: false };
}
