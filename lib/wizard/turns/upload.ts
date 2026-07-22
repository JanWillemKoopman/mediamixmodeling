// Fase "upload" — het enige geaccepteerde niet-tekst-element in de hele wizard: ruwe
// CSV/XLSX-bytes kunnen niet als chattekst verstuurd worden. Dit is de bijlage-affordance
// in de compose-balk (net als een bijlage in Slack/WhatsApp), geen wizard-formulier.

import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import { buildSourceProfile } from "@/lib/dataProfile";
import { humanizeError } from "@/lib/humanizeMessage";
import type { SourceProfile } from "@/lib/types";
import type { TurnEnv, TurnReplyResult } from "@/lib/wizard/turns/types";

const BUCKET = "mmm-raw-data";
const PREVIEW_LINES = 15;
const MAX_FILE_MB = 50;

function validateFile(file: File): string | null {
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return `"${file.name}" is geen CSV- of Excel-bestand.`;
  if (file.size === 0) return `"${file.name}" is leeg.`;
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return `"${file.name}" is groter dan ${MAX_FILE_MB} MB. Aggregeer naar weekniveau of kies een kortere periode.`;
  }
  return null;
}

function buildProfileFromCsv(text: string): SourceProfile | null {
  try {
    const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
    const columns = parsed.meta.fields ?? [];
    if (columns.length === 0 || parsed.data.length === 0) return null;
    return buildSourceProfile(columns, parsed.data);
  } catch {
    return null;
  }
}

// Aangeroepen vanuit de bijlage-knop/drag-drop in de composer. Zelfde upload/insert/
// classify-flow als de oude UploadCard.upload().
export async function uploadSourceFile(projectId: string, files: FileList | File[]): Promise<{ error: string | null }> {
  const list = Array.from(files);
  if (list.length === 0) return { error: null };
  if (list.length > 1) return { error: "Je werkt met precies één bestand. Kies één CSV of Excel-bestand." };
  const file = list[0];
  const invalid = validateFile(file);
  if (invalid) return { error: invalid };

  const supabase = createClient();
  const path = `${projectId}/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
  if (upErr) return { error: humanizeError(upErr.message, "Het uploaden is niet gelukt — probeer het opnieuw.").text };

  const isCsv = /\.csv$/i.test(file.name);
  const csvText = isCsv ? await file.text() : null;
  const preview = csvText ? csvText.split("\n").slice(0, PREVIEW_LINES).join("\n") : null;
  const profile = csvText ? buildProfileFromCsv(csvText) : null;
  const { data: inserted, error: rowErr } = await supabase
    .schema("mmm")
    .from("source_files")
    .insert({ project_id: projectId, name: file.name, storage_path: path, preview, profile })
    .select("id")
    .single();
  if (rowErr) return { error: humanizeError(rowErr.message, "Het opslaan is niet gelukt — probeer het opnieuw.").text };

  if (inserted?.id && preview) {
    void fetch("/api/classify-columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_file_id: inserted.id }),
    }).catch(() => {});
  }
  return { error: null };
}

export function intro(): string {
  return "";
}

// Geen tekstvraag in deze fase (het bestand komt via de bijlage-affordance) — elk getypt
// bericht mag gewoon naar de architect (bv. een vraag over het exportformaat).
export async function resolve(_env: TurnEnv, _reply: string): Promise<TurnReplyResult> {
  return { handled: false };
}
