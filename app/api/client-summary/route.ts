import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildClientSummaryRequest } from "@/lib/anthropic/clientSummary";
import { isHierSummary } from "@/lib/types";
import type { ClientSummary, FitSummary } from "@/lib/types";
import { withJsonErrors, claudeErrorMessage } from "@/lib/apiRoute";

export const maxDuration = 60;

// Genereer (en bewaar) een presentatieklare klantsamenvatting voor één run. Alleen voor
// bouwers — de klant ziet hooguit het resultaat ervan als de bouwer het in zijn rapport
// plakt; er gaat niets automatisch naar het klantdashboard.
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
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is niet geconfigureerd op de server." }, { status: 503 });
  }

  const supabase = createClient();
  let runQuery = supabase.schema("mmm").from("model_runs").select("id, summary").eq("project_id", projectId);
  runQuery = modelRunId ? runQuery.eq("id", modelRunId) : runQuery.order("created_at", { ascending: false }).limit(1);
  const { data: run } = await runQuery.maybeSingle();

  if (!run) {
    return NextResponse.json({ error: "Geen fit-resultaat gevonden voor dit project." }, { status: 404 });
  }
  if (isHierSummary(run.summary)) {
    return NextResponse.json(
      { error: "Klantsamenvatting wordt (nog) niet ondersteund voor hiërarchische runs." },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey });
  const params = buildClientSummaryRequest(run.summary as FitSummary);
  let response: Anthropic.Message;
  try {
    response = await client.messages.create(params);
  } catch (err) {
    return NextResponse.json({ error: claudeErrorMessage(err) }, { status: 502 });
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n\n");

  const clientSummary: ClientSummary = {
    text,
    model: params.model,
    generated_at: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .schema("mmm")
    .from("model_runs")
    .update({ client_summary: clientSummary })
    .eq("id", run.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  return NextResponse.json({ client_summary: clientSummary });
}

export const POST = withJsonErrors(handlePost);
