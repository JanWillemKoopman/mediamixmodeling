import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildInspectionRequest, parseInspectionResult, INSPECTION_MODEL } from "@/lib/anthropic/dataInspection";
import type { Dataset, DataInspection, SourceFile } from "@/lib/types";
import { withJsonErrors, claudeErrorMessage } from "@/lib/apiRoute";

// Deep data inspection: hand the raw uploads (or the approved master) to Claude in the
// sandboxed code_execution container and store the structured findings + narrative on
// mmm.data_inspections, where the chat architect reads them. This is the heavy, explicitly
// triggered "give Claude real eyes on the data" action — the counterpart to the cheap,
// automatic per-file profile.
//
// A code_execution loop can pause at 10 server-tool iterations (stop_reason "pause_turn");
// resume by re-sending with the paused assistant turn appended (same pattern as
// /api/analysis). The whole loop can run minutes — too long to hold a single client
// connection open, especially on mobile networks that drop an idle fetch well before that
// (the builder then saw a bare "Geen verbinding met de server", even though the server was
// still working fine). So the route now inserts a 'running' row and responds immediately;
// the actual Claude work continues after the response via @vercel/functions' waitUntil,
// and the client polls/subscribes on the row's status instead of waiting on the request.
// maxDuration still bounds the total time (request handling + the background work
// together), so give it real headroom.
export const maxDuration = 120;
const MAX_CONTINUATIONS = 3;
// Both raw sources AND the merged master live in the raw bucket: the prepare worker writes
// the master back into the raw bucket on purpose, so a later fit (which only reads raw) can
// pick it up (see worker/mmm_worker/modal_app.py). So the master download uses the same bucket.
const RAW_BUCKET = "mmm-raw-data";
const MASTER_BUCKET = "mmm-raw-data";
const MAX_RAW_FILES = 4; // bound cost/latency — the architect can re-run if it needs more

async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const projectId: string | undefined = body?.project_id;
  const scope: "raw" | "master" = body?.scope === "master" ? "master" : "raw";
  if (!projectId) {
    return NextResponse.json({ error: "project_id is verplicht" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY niet geconfigureerd." }, { status: 503 });
  }

  const supabase = createClient();

  // Collect the CSV bytes to inspect: either the approved/latest master, or the raw sources.
  const toInspect: { name: string; blob: Blob }[] = [];
  let datasetId: string | null = null;
  if (scope === "master") {
    const { data: ds } = await supabase
      .schema("mmm")
      .from("datasets")
      .select("*")
      .eq("project_id", projectId)
      .in("status", ["prepared", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const dataset = ds as Dataset | null;
    if (!dataset?.master_path) {
      return NextResponse.json({ error: "Geen samengevoegde master-tabel gevonden." }, { status: 404 });
    }
    datasetId = dataset.id;
    const { data, error } = await supabase.storage.from(MASTER_BUCKET).download(dataset.master_path);
    if (error || !data) {
      return NextResponse.json({ error: `Kon master niet downloaden: ${error?.message}` }, { status: 400 });
    }
    toInspect.push({ name: "master.csv", blob: data });
  } else {
    const { data: sources } = await supabase
      .schema("mmm")
      .from("source_files")
      .select("id, name, storage_path")
      .eq("project_id", projectId)
      .order("created_at");
    const csvSources = ((sources ?? []) as Pick<SourceFile, "id" | "name" | "storage_path">[])
      .filter((s) => /\.csv$/i.test(s.name))
      .slice(0, MAX_RAW_FILES);
    if (csvSources.length === 0) {
      return NextResponse.json({ error: "Geen CSV-bronbestanden om te inspecteren." }, { status: 404 });
    }
    for (const s of csvSources) {
      const { data, error } = await supabase.storage.from(RAW_BUCKET).download(s.storage_path);
      if (error || !data) continue; // skip a single unreadable file rather than fail the whole run
      toInspect.push({ name: s.name, blob: data });
    }
    if (toInspect.length === 0) {
      return NextResponse.json({ error: "Kon geen bronbestanden downloaden." }, { status: 400 });
    }
  }

  // Placeholder row: the client gets this back immediately and polls/subscribes on it
  // rather than waiting on the (potentially minutes-long) Claude call below.
  const { data: running, error: insertErr } = await supabase
    .schema("mmm")
    .from("data_inspections")
    .insert({
      project_id: projectId,
      dataset_id: datasetId,
      scope,
      status: "running",
      model: INSPECTION_MODEL,
      created_by: viewer.id,
    })
    .select("*")
    .single();
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }

  const inspectionId = (running as DataInspection).id;

  // The actual Claude/code_execution work happens after the response has gone out, so a
  // dropped or backgrounded client connection can't take it down — only the row's status
  // does the talking from here.
  waitUntil((async () => {
    const client = new Anthropic({ apiKey });
    const bg = createClient();

    async function fail(message: string) {
      await bg
        .schema("mmm")
        .from("data_inspections")
        .update({ status: "error", error: message })
        .eq("id", inspectionId);
    }

    const fileIds: string[] = [];
    const fileNames: string[] = [];
    try {
      for (const { name, blob } of toInspect) {
        const uploaded = await client.beta.files.upload({
          file: await toFile(blob, name, { type: "text/csv" }),
          betas: ["files-api-2025-04-14"],
        });
        fileIds.push(uploaded.id);
        fileNames.push(name);
      }
    } catch (err) {
      await fail(`Upload naar Files API mislukte: ${(err as Error).message}`);
      return;
    }

    const params = buildInspectionRequest(fileIds, fileNames);
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = params.messages;
    const allBlocks: Anthropic.Beta.Messages.BetaContentBlock[] = [];
    try {
      let turn = 0;
      let response: Anthropic.Beta.Messages.BetaMessage;
      do {
        response = await client.beta.messages.create({ ...params, messages });
        allBlocks.push(...response.content);
        if (response.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: response.content });
        turn += 1;
      } while (turn <= MAX_CONTINUATIONS);
    } catch (err) {
      await fail(claudeErrorMessage(err));
      return;
    }

    const toolUse = allBlocks.find(
      (b): b is Anthropic.Beta.Messages.BetaToolUseBlock =>
        b.type === "tool_use" && b.name === "report_data_findings",
    );
    const parsed = toolUse ? parseInspectionResult(toolUse.input) : null;

    await bg
      .schema("mmm")
      .from("data_inspections")
      .update(
        parsed
          ? { status: "done", findings: parsed.findings, narrative: parsed.narrative, error: null }
          : { status: "error", error: "Geen gestructureerde bevindingen ontvangen." },
      )
      .eq("id", inspectionId);
  })());

  return NextResponse.json({ inspection: running });
}

export const POST = withJsonErrors(handlePost);
