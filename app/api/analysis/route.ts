import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildDeepAnalysisRequest } from "@/lib/anthropic/deepAnalysis";
import type { AnalysisChart, FitSummary, RunAnalysis } from "@/lib/types";
import { withJsonErrors } from "@/lib/apiRoute";

// Deep-analysis generation may run several server-tool (code_execution) iterations
// inside one turn — comfortably longer than a normal chat round trip. Give the route
// real headroom; raise further if the deployment's Vercel plan allows and this proves
// too tight in practice.
export const maxDuration = 120;

// A server-tool loop (code_execution) pauses at 10 iterations with stop_reason
// "pause_turn" — per Anthropic's guidance, resuming means re-sending the same request
// with the paused assistant turn appended, not adding a new user message. Cap the number
// of resumes so a stuck loop can't run indefinitely; if still incomplete after the cap,
// use whatever text/charts were produced so far rather than failing outright.
const MAX_CONTINUATIONS = 3;

function extractText(blocks: Anthropic.Beta.Messages.BetaContentBlock[]): string {
  return blocks
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n\n");
}

function extractChartFileIds(blocks: Anthropic.Beta.Messages.BetaContentBlock[]): string[] {
  const ids: string[] = [];
  for (const block of blocks) {
    if (block.type !== "bash_code_execution_tool_result") continue;
    const content = block.content;
    if (content.type !== "bash_code_execution_result") continue; // skip tool-result errors
    for (const output of content.content) {
      if (output.type === "bash_code_execution_output") ids.push(output.file_id);
    }
  }
  return ids;
}

async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const projectId: string | undefined = body?.project_id;
  const modelRunId: string | undefined = body?.model_run_id;
  if (!projectId) {
    return NextResponse.json({ error: "project_id is verplicht" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is niet geconfigureerd op de server." },
      { status: 503 },
    );
  }

  const supabase = createClient();
  let runQuery = supabase
    .schema("mmm")
    .from("model_runs")
    .select("id, summary")
    .eq("project_id", projectId);
  runQuery = modelRunId
    ? runQuery.eq("id", modelRunId)
    : runQuery.order("created_at", { ascending: false }).limit(1);
  const { data: run } = await runQuery.maybeSingle();

  if (!run) {
    return NextResponse.json({ error: "Geen fit-resultaat gevonden voor dit project." }, { status: 404 });
  }

  const client = new Anthropic({ apiKey });
  const params = buildDeepAnalysisRequest(run.summary as FitSummary);

  let response: Anthropic.Beta.Messages.BetaMessage;
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = params.messages;
  const textParts: string[] = [];
  const fileIds: string[] = [];
  try {
    let turn = 0;
    do {
      response = await client.beta.messages.create({ ...params, messages });
      textParts.push(extractText(response.content));
      fileIds.push(...extractChartFileIds(response.content));
      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content });
      turn += 1;
    } while (turn <= MAX_CONTINUATIONS);
  } catch (err) {
    return NextResponse.json({ error: `Claude API-fout: ${(err as Error).message}` }, { status: 502 });
  }

  const charts: AnalysisChart[] = [];
  for (const fileId of fileIds) {
    try {
      const meta = await client.beta.files.retrieveMetadata(fileId);
      if (!meta.mime_type.startsWith("image/")) continue; // only charts are surfaced
      const download = await client.beta.files.download(fileId);
      const bytes = Buffer.from(await download.arrayBuffer());
      charts.push({
        filename: meta.filename,
        mime_type: meta.mime_type,
        data_url: `data:${meta.mime_type};base64,${bytes.toString("base64")}`,
      });
    } catch {
      // A single chart failing to download must not lose the rest of the analysis.
      continue;
    }
  }

  const analysis: RunAnalysis = {
    text: textParts.filter(Boolean).join("\n\n"),
    charts,
    model: params.model,
    generated_at: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .schema("mmm")
    .from("model_runs")
    .update({ analysis })
    .eq("id", run.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  return NextResponse.json({ analysis });
}

export const POST = withJsonErrors(handlePost);
