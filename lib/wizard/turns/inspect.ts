// Fase "inspect" — data-inspectie & kolomherkenning, puur als tekst. De AI-classificatie
// (die al bij upload draaide) wordt samengevat in lopende tekst; de bouwer bevestigt of
// corrigeert met een genummerd menu i.p.v. per-kolom dropdowns.

import { createClient } from "@/lib/supabase/client";
import { humanizeError } from "@/lib/humanizeMessage";
import { postJson } from "@/lib/fetchJson";
import { formatMenu, matchOption, type MenuOption } from "@/lib/wizard/questions";
import type { ColumnMapping, DataInspection, SourceFile } from "@/lib/types";
import type { TurnEnv, TurnReplyResult } from "@/lib/wizard/turns/types";

const GRANULARITY_LABEL: Record<string, string> = {
  day: "dagelijks",
  week: "wekelijks",
  onbekend: "onbekend (controleer zelf)",
};

function formatMappingSummary(mapping: ColumnMapping | null, source: SourceFile): string {
  const cols = mapping?.columns ?? [];
  const profile = source.profile;
  const dateCol = cols.find((c) => c.role === "date")?.name ?? profile?.date_column ?? null;
  const granularity = GRANULARITY_LABEL[mapping?.granularity ?? "onbekend"];
  const kpiCols = cols.filter((c) => c.role === "kpi").map((c) => c.name);
  const spendCols = cols.filter((c) => c.role === "spend");
  const controlCols = cols.filter((c) => c.role === "control").map((c) => c.name);
  const dateRange = profile?.date_range ?? null;
  const gaps = (profile?.columns ?? []).filter((c) => c.longest_missing_run > 1);

  const lines: string[] = [];
  if (!mapping) {
    lines.push(
      "De automatische kolomherkenning is niet (of nog niet) beschikbaar — de rollen hieronder zijn gegokt op basis van de kolomnamen, loop ze extra goed na.",
    );
  }
  lines.push(`**Datum**: ${dateCol ?? "(niet gevonden)"} — ${granularity}`);
  if (dateRange) lines.push(`**Periode**: ${dateRange[0]} t/m ${dateRange[1]} (${profile?.n_rows ?? "?"} rijen)`);
  lines.push(`**KPI**: ${kpiCols[0] ?? "(niet gevonden)"}`);
  lines.push(
    `**Kanalen** (${spendCols.length}): ${spendCols.map((c) => (c.unit ? `${c.name} (${c.unit})` : c.name)).join(", ") || "(geen)"}`,
  );
  if (controlCols.length) lines.push(`**Overige variabelen**: ${controlCols.join(", ")}`);
  if (gaps.length) {
    lines.push(
      `Let op: gat in ${gaps.map((g) => `"${g.name}" (${g.longest_missing_run} rijen)`).join(", ")} — dat lossen we in de volgende stap op.`,
    );
  }
  return lines.join("\n");
}

const INSPECT_OPTIONS: MenuOption[] = [
  { key: "confirm", label: "Klopt, ga door", synonyms: ["klopt", "ja", "ga door", "confirm", "goed"] },
  { key: "correct", label: "Ik wil iets aanpassen", synonyms: ["aanpassen", "wijzigen", "nee", "klopt niet"] },
  {
    key: "deep",
    label: "Laat de AI de data grondig inspecteren (kan een paar minuten duren)",
    synonyms: ["inspecteer", "diepgaand", "grondig", "inspectie"],
  },
];

export function intro(env: TurnEnv): string {
  if (!env.source) return "";
  return `${formatMappingSummary(env.source.mapping, env.source)}\n\n${formatMenu(INSPECT_OPTIONS)}`;
}

function validMapping(mapping: ColumnMapping | null): string | null {
  if (!mapping) return "Er is nog geen kolomherkenning beschikbaar — beschrijf zelf welke kolom wat is (optie 2).";
  const dateCount = mapping.columns.filter((c) => c.role === "date").length;
  const kpiCount = mapping.columns.filter((c) => c.role === "kpi").length;
  const spendCount = mapping.columns.filter((c) => c.role === "spend").length;
  if (dateCount !== 1) return "Ik zie niet precies één datumkolom — beschrijf welke kolom de datum is (optie 2).";
  if (kpiCount !== 1) return "Ik zie niet precies één KPI-kolom — beschrijf welke kolom je doel is (optie 2).";
  if (spendCount === 0) return "Ik zie nog geen enkel kanaal (uitgaven-kolom) — beschrijf welke kolommen dat zijn (optie 2).";
  return null;
}

async function runDeepInspection(env: TurnEnv): Promise<void> {
  const res = await postJson<{ inspection: DataInspection }>("/api/inspect", { project_id: env.projectId, scope: "raw" });
  if (!res.ok || !res.data.inspection) {
    env.pushMessage(humanizeError(res.error, "De diepgaande inspectie is niet gelukt — probeer het opnieuw.").text);
    return;
  }
  const inspectionId = res.data.inspection.id;
  const supabase = createClient();
  const poll = setInterval(async () => {
    const { data } = await supabase.schema("mmm").from("data_inspections").select("*").eq("id", inspectionId).maybeSingle();
    const row = data as DataInspection | null;
    if (!row || row.status === "running") return;
    clearInterval(poll);
    if (row.status === "error") {
      env.pushMessage(humanizeError(row.error, "De diepgaande inspectie is niet gelukt — probeer het opnieuw.").text);
      return;
    }
    const parts: string[] = [];
    if (row.narrative) parts.push(row.narrative);
    for (const f of row.findings ?? []) {
      parts.push(`- ${f.column ? `${f.column}: ` : ""}${f.detail}${f.suggestion ? ` (voorstel: ${f.suggestion})` : ""}`);
    }
    env.pushMessage((parts.join("\n") || "Geen bijzonderheden gevonden.") + `\n\n${formatMenu(INSPECT_OPTIONS)}`);
  }, 3000);
}

export async function resolve(env: TurnEnv, reply: string): Promise<TurnReplyResult> {
  const source = env.source;
  if (!source) return { handled: false };

  if (env.phaseState === "correcting") {
    const res = await postJson<{ mapping: ColumnMapping | null }>("/api/classify-columns", {
      source_file_id: source.id,
      correction: reply,
    });
    env.setPhaseState(null);
    if (!res.ok || !res.data.mapping) {
      return {
        handled: true,
        reply: humanizeError(res.error, "De aanpassing is niet gelukt — probeer het anders te omschrijven.").text,
      };
    }
    return {
      handled: true,
      refresh: true,
      reply: `Aangepast:\n\n${formatMappingSummary(res.data.mapping, { ...source, mapping: res.data.mapping })}\n\n${formatMenu(INSPECT_OPTIONS)}`,
    };
  }

  const match = matchOption(reply, INSPECT_OPTIONS);
  if (!match) return { handled: false };

  if (match.key === "confirm") {
    const problem = validMapping(source.mapping);
    if (problem) return { handled: true, reply: problem };
    const supabase = createClient();
    const { error } = await supabase
      .schema("mmm")
      .from("source_files")
      .update({ mapping: source.mapping, inspection_confirmed_at: new Date().toISOString() })
      .eq("id", source.id);
    if (error) return { handled: true, reply: humanizeError(error.message, "Bevestigen is niet gelukt — probeer het opnieuw.").text };
    return { handled: true, refresh: true, reply: "Top, kolommen bevestigd. Nu gaan we de data opschonen en verrijken." };
  }

  if (match.key === "correct") {
    env.setPhaseState("correcting");
    return {
      handled: true,
      reply:
        "Beschrijf wat er niet klopt (bijvoorbeeld: \"kolom omzet is de KPI, niet een control\" of \"kolom besteldatum is de datum\"). Ik pas de indeling aan.",
    };
  }

  if (match.key === "deep") {
    void runDeepInspection(env);
    return {
      handled: true,
      reply: "Ik inspecteer de volledige reeks — dat kan een paar minuten duren, ik laat het hier weten zodra ik klaar ben.",
    };
  }

  return { handled: false };
}
