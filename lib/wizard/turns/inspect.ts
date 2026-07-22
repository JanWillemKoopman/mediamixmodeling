// Fase "inspect" — data-inspectie & kolomherkenning, puur als tekst. De AI-classificatie
// (die al bij upload draaide) wordt samengevat in lopende tekst; de bouwer bevestigt of
// corrigeert met een genummerd menu i.p.v. per-kolom dropdowns.
//
// De diepe inspectie (optie 3) is een minutenlange achtergrondtaak op de server
// (app/api/inspect/route.ts, waitUntil). De uitkomst wordt NOOIT via een client-side timer
// gepolld — zo'n timer overleeft een achtergrondgezette mobiele tab niet, waardoor de chat
// stil bleef hangen terwijl de inspectie allang klaar was. In plaats daarvan is
// `latestInspection` server-side opgehaald (app/projects/[id]/page.tsx) en via Realtime
// bijgewerkt (ChatWizard's data_inspections-subscriptie) — de intro-tekst leest 'm gewoon
// uit, net als dataset/jobs/runs.

import { createClient } from "@/lib/supabase/client";
import { humanizeError } from "@/lib/humanizeMessage";
import { postJson } from "@/lib/fetchJson";
import { formatMenu, matchOption, type MenuOption } from "@/lib/wizard/questions";
import type { ColumnMapping, ColumnMappingEntry, PrepareRecipe, DataInspection, SourceFile } from "@/lib/types";
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

function formatInspectionResult(row: DataInspection): string {
  if (row.status === "running") return "_Ik ben de data nog aan het inspecteren — dat kan nog even duren._";
  if (row.status === "error") {
    return humanizeError(row.error, "De diepgaande inspectie is niet gelukt — probeer het opnieuw.").text;
  }
  const parts: string[] = [];
  if (row.narrative) parts.push(row.narrative);
  for (const f of row.findings ?? []) {
    parts.push(`- ${f.column ? `${f.column}: ` : ""}${f.detail}${f.suggestion ? ` (voorstel: ${f.suggestion})` : ""}`);
  }
  return parts.join("\n") || "Geen bijzonderheden gevonden.";
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
  const parts = [formatMappingSummary(env.source.mapping, env.source)];
  if (env.latestInspection) parts.push(formatInspectionResult(env.latestInspection));
  parts.push(formatMenu(INSPECT_OPTIONS));
  return parts.join("\n\n");
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

// De architect kan een samenvoeg-recept voorstellen én laten toepassen zonder dat de
// bouwer ooit optie 1 ("klopt, ga door") hierboven heeft getypt — dat is prima, het recept
// legt de rol per kolom al net zo hard vast. Zonder deze functie bleef `derivePhase` na zo'n
// toepassing voor altijd "inspect" melden (die check staat vóór alle datasetchecks), met als
// zichtbaar gevolg: de stap-kop klopte niet meer, de wacht-indicator voor "samenvoegen"
// verscheen nooit, én elk volgend bericht werd nog steeds door déze fase-resolver gelezen —
// wat er bijvoorbeeld toe leidde dat een vrije-tekst antwoord als "ja doe dat" (bedoeld voor
// de architect) hier per ongeluk als "klopt, ga door" werd opgevat. Toepassen van een recept
// is dus een impliciete, minstens zo sterke bevestiging als optie 1 zelf.
export async function confirmMappingFromRecipe(source: SourceFile, recipe: PrepareRecipe): Promise<void> {
  const src = recipe.sources[0];
  if (!src) return;
  const byName = new Map<string, ColumnMappingEntry>((source.mapping?.columns ?? []).map((c) => [c.name, c]));
  for (const c of src.columns) {
    const prev = byName.get(c.name);
    byName.set(c.name, { name: c.name, role: c.role, meaning: prev?.meaning ?? "", unit: prev?.unit ?? null, confidence: prev?.confidence ?? "laag" });
  }
  if (src.date_column) {
    const prev = byName.get(src.date_column);
    byName.set(src.date_column, {
      name: src.date_column,
      role: "date",
      meaning: prev?.meaning ?? "",
      unit: prev?.unit ?? null,
      confidence: prev?.confidence ?? "laag",
    });
  }
  const mapping: ColumnMapping = {
    granularity: source.mapping?.granularity ?? "onbekend",
    layout: source.mapping?.layout ?? "onbekend",
    currency: source.mapping?.currency ?? null,
    reasoning: source.mapping?.reasoning ?? "",
    columns: Array.from(byName.values()),
  };
  const supabase = createClient();
  await supabase
    .schema("mmm")
    .from("source_files")
    .update({ mapping, inspection_confirmed_at: new Date().toISOString() })
    .eq("id", source.id);
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
    if (env.latestInspection?.status === "running") {
      return { handled: true, reply: "Ik ben al bezig met een inspectie — dat verschijnt hierboven zodra ik klaar ben." };
    }
    const res = await postJson<{ inspection: DataInspection }>("/api/inspect", { project_id: env.projectId, scope: "raw" });
    if (!res.ok || !res.data.inspection) {
      return { handled: true, reply: humanizeError(res.error, "De diepgaande inspectie kon niet gestart worden — probeer het opnieuw.").text };
    }
    return {
      handled: true,
      refresh: true,
      reply: "Ik inspecteer de volledige reeks — dat kan een paar minuten duren. De uitkomst verschijnt hierboven zodra ik klaar ben (ook als je de pagina intussen sluit).",
    };
  }

  return { handled: false };
}
