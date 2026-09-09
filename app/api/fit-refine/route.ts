import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildRequest } from "@/lib/anthropic/architect";
import { withJsonErrors, claudeErrorMessage } from "@/lib/apiRoute";
import type { ArchitectFitContext } from "@/lib/anthropic/fitContext";
import type { ArchitectDatasetContext } from "@/lib/anthropic/datasetContext";
import type {
  DataInspection,
  DatasetVersion,
  FitSummary,
  ModelIntent,
  ProjectContext,
  RunErrorCode,
  SourceFile,
} from "@/lib/types";

// Ask the architect to diagnose the last run and PROPOSE a corrected intent.
//
// It does not start anything. In v1 this endpoint took the language model's tool output and
// inserted it straight into the job queue — priors, calibration and storage path included —
// while its own comment claimed there was a human in the loop. There was not: the only limit
// was a round counter read from `body.round`, which the client supplies, so sending
// `round: 1` every time bypassed it entirely and each round cost a full Modal fit.
//
// Now the proposal comes back to the user, who applies it the same way they apply any other
// proposal. The AI still does the hard part — reading the diagnostics and working out what
// to change — it just does not get to spend compute on its own conclusion.
export const maxDuration = 120;

// How many diagnose-and-propose rounds are worth doing before the answer is "this needs a
// person". Counted from the runs in the database, not from anything the client sends.
const MAX_ROUNDS = 3;

async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const projectId: string | undefined = body?.project_id;
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

  const [{ data: sources }, { data: runs }, { data: dataset }, { data: projectContext }, { data: inspection }] =
    await Promise.all([
      supabase
        .schema("mmm")
        .from("source_files")
        .select("id, project_id, name, storage_path, preview, profile, mapping, created_at")
        .eq("project_id", projectId)
        .order("created_at"),
      supabase
        .schema("mmm")
        .from("model_runs")
        .select("id, state, error_code, error_message, created_at, finished_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(MAX_ROUNDS + 2),
      supabase
        .schema("mmm")
        .from("dataset_versions")
        .select("*")
        .eq("project_id", projectId)
        .not("approved_at", "is", null)
        .maybeSingle(),
      supabase.schema("mmm").from("project_context").select("*").eq("project_id", projectId).maybeSingle(),
      supabase
        .schema("mmm")
        .from("data_inspections")
        .select("*")
        .eq("project_id", projectId)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const runList = runs ?? [];
  const latestRun = runList[0];
  if (!latestRun) {
    return NextResponse.json({ error: "Er is nog geen berekening om te verbeteren." }, { status: 400 });
  }
  if (!["completed", "failed", "cancelled"].includes(latestRun.state)) {
    return NextResponse.json({
      status: "waiting",
      message: "Er loopt nog een berekening; wacht tot die klaar is.",
    });
  }

  // The round count comes from the database, so it cannot be reset by the caller.
  const finishedRounds = runList.filter((r) => r.state === "completed" || r.state === "failed").length;
  if (finishedRounds >= MAX_ROUNDS) {
    return NextResponse.json({
      status: "exhausted",
      message:
        `Er zijn al ${finishedRounds} berekeningen gedaan voor dit project. Verder verfijnen ` +
        `heeft weinig zin zonder eerst naar de data te kijken — bespreek het in de chat.`,
    });
  }

  const { data: result } = await supabase
    .schema("mmm")
    .from("model_results")
    .select("summary")
    .eq("model_run_id", latestRun.id)
    .maybeSingle();
  const { data: validation } = await supabase
    .schema("mmm")
    .from("model_validations")
    .select("*")
    .eq("model_run_id", latestRun.id)
    .maybeSingle();

  const level = validation?.level as string | undefined;
  if (latestRun.state === "completed" && level === "usable_for_decisions") {
    return NextResponse.json({
      status: "done",
      message:
        "De laatste berekening is bruikbaar om budget op te sturen — er valt niets te " +
        "verbeteren. Beoordeel en publiceer wanneer je tevreden bent.",
    });
  }

  const fit: ArchitectFitContext = {
    latestRun: result
      ? { summary: result.summary as FitSummary, created_at: latestRun.created_at as string }
      : null,
    previousRuns: [],
    latestRunState: {
      state: latestRun.state as string,
      error_code: (latestRun.error_code as RunErrorCode | null) ?? null,
      error_message: (latestRun.error_message as string | null) ?? null,
      created_at: latestRun.created_at as string,
    },
    validation: (validation as never) ?? null,
  };
  const datasetContext: ArchitectDatasetContext = {
    latestDataset: (dataset as DatasetVersion | null) ?? null,
  };
  const sourceFiles = (sources ?? []) as unknown as SourceFile[];
  const previews = sourceFiles.map((f) => ({ file: f, preview: f.preview ?? null }));

  const prompt =
    latestRun.state === "failed"
      ? "De laatste berekening is MISLUKT. Lees de foutmelding, benoem de oorzaak in gewone " +
        "taal en roep propose_model_intent aan met een aangepaste intentie die dit oplost. " +
        "Zie je geen verantwoorde aanpassing (bijvoorbeeld omdat het probleem in de data " +
        "zit), roep dan geen tool aan maar leg uit wat de gebruiker moet doen."
      : "De laatste berekening is afgerond maar haalt de bruikbaarheidsdrempel niet. Lees de " +
        "beoordeling, benoem per punt wat eraan schort, en roep propose_model_intent aan met " +
        "een gericht aangepaste intentie — verander alleen wat de diagnose aanwijst en leg in " +
        "reasoning uit wat je veranderde en waarom. Is het probleem niet met de intentie op te " +
        "lossen, zeg dat dan en verwijs naar de stap die het wél kan oplossen.";

  const client = new Anthropic({ apiKey });
  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      buildRequest(
        {
          sources: previews,
          dataset: datasetContext,
          fit,
          businessContext: (projectContext as ProjectContext | null) ?? null,
          inspection: (inspection as DataInspection | null) ?? null,
        },
        [{ role: "user", content: prompt }],
      ),
    );
  } catch (err) {
    return NextResponse.json({ error: claudeErrorMessage(err) }, { status: 502 });
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "propose_model_intent",
  );
  const reasoning = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();

  // The whole round is visible in the project chat, so the trail is followable and the
  // builder can step in at any point.
  await supabase.schema("mmm").from("chat_messages").insert([
    { project_id: projectId, role: "user", content: [{ type: "text", text: prompt }], created_by: viewer.id },
    { project_id: projectId, role: "assistant", content: response.content, created_by: viewer.id },
  ]);

  if (!toolUse) {
    return NextResponse.json({
      status: "no_proposal",
      message: reasoning || "De AI zag geen verantwoorde aanpassing van de modelinstellingen.",
    });
  }

  const { reasoning: proposalReasoning, ...intent } = toolUse.input as {
    reasoning?: string;
  } & ModelIntent;

  // A proposal, nothing more. The user applies it — which runs the same validation and the
  // same prior gate as any other configuration.
  return NextResponse.json({
    status: "proposed",
    intent,
    reasoning: proposalReasoning ?? reasoning,
    rounds_used: finishedRounds,
    rounds_left: MAX_ROUNDS - finishedRounds,
  });
}

export const POST = withJsonErrors(handlePost);
