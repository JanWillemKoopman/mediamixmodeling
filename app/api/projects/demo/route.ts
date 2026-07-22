import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildSourceProfile } from "@/lib/dataProfile";
import type { SourceProfile } from "@/lib/types";
import { withJsonErrors } from "@/lib/apiRoute";

// Start een kant-en-klaar demo-project: maakt het project aan, uploadt de meegeleverde
// MediaMarkt-demo-CSV (demo_data/) naar Storage en registreert 'm precies zoals een
// handmatige upload — inclusief preview en volledige-reeks-profiel, en met de
// kolom-classificatie als fire-and-forget vervolgstap. Bedoeld voor trainingen en om de
// wizard te leren kennen zonder eerst klantdata te hoeven regelen.
//
// Let op: het CSV-bestand wordt via outputFileTracingIncludes (next.config.mjs) in de
// serverless bundle meegenomen.

const BUCKET = "mmm-raw-data";
const DEMO_FILE = "mediamarkt_demo_dataset.csv";
const PREVIEW_LINES = 15; // mirrors SourceUpload.tsx / chat context size

function buildProfileFromCsv(text: string): SourceProfile | null {
  try {
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });
    const columns = parsed.meta.fields ?? [];
    if (columns.length === 0 || parsed.data.length === 0) return null;
    return buildSourceProfile(columns, parsed.data);
  } catch {
    return null;
  }
}

async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  let csvText: string;
  try {
    csvText = await fs.readFile(path.join(process.cwd(), "demo_data", DEMO_FILE), "utf8");
  } catch {
    return NextResponse.json(
      { error: "Demo-dataset niet gevonden op de server (demo_data/ ontbreekt in de deploy)." },
      { status: 500 },
    );
  }

  const supabase = createClient();

  const { data: project, error: projErr } = await supabase
    .schema("mmm")
    .from("projects")
    .insert({
      name: "Demo — MediaMarkt (flatscreens)",
      client_company: "MediaMarkt NL (demo)",
      created_by: viewer.id,
    })
    .select("id")
    .single();
  if (projErr || !project) {
    return NextResponse.json({ error: projErr?.message ?? "Project aanmaken mislukt." }, { status: 400 });
  }

  const storagePath = `${project.id}/${Date.now()}-${DEMO_FILE}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, new Blob([csvText], { type: "text/csv" }));
  if (upErr) {
    return NextResponse.json({ error: `Upload naar Storage mislukt: ${upErr.message}` }, { status: 400 });
  }

  const preview = csvText.split("\n").slice(0, PREVIEW_LINES).join("\n");
  const profile = buildProfileFromCsv(csvText);
  const { data: inserted, error: rowErr } = await supabase
    .schema("mmm")
    .from("source_files")
    .insert({ project_id: project.id, name: DEMO_FILE, storage_path: storagePath, preview, profile })
    .select("id")
    .single();
  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 400 });
  }

  // Kolom-classificatie fire-and-forget, net als bij een gewone upload (best-effort — de
  // architect kan rollen ook zelf afleiden als dit faalt of de API-key ontbreekt).
  if (inserted?.id) {
    const origin = new URL(request.url).origin;
    void fetch(`${origin}/api/classify-columns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") ?? "" },
      body: JSON.stringify({ source_file_id: inserted.id }),
    }).catch(() => {});
  }

  return NextResponse.json({ project_id: project.id });
}

export const POST = withJsonErrors(handlePost);
