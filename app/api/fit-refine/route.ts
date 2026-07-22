import { NextResponse } from "next/server";
import { withJsonErrors, claudeErrorMessage } from "@/lib/apiRoute";
import Anthropic from "@anthropic-ai/sdk";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildRequest } from "@/lib/anthropic/architect";
import { MAX_CONCURRENT_JOBS, hasJobCapacity, nudgeModalEnqueue } from "@/lib/jobs";
import { isHierSummary } from "@/lib/types";
import type { ArchitectFitContext } from "@/lib/anthropic/fitContext";
import type { ArchitectDatasetContext } from "@/lib/anthropic/datasetContext";
import type {
  DataInspection,
  Dataset,
  FitSummary,
  JobConfig,
  JobStatus,
  ProjectContext,
  SourceFile,
} from "@/lib/types";

// Agentic auto-verfijn voor de FIT-lus — de tegenhanger van /api/prepare-auto, maar dan
// voor de dure stap. Eén aanroep = één ronde: de architect beoordeelt de laatste fit
// (mislukt, of kwaliteitspoort warn/fail), stelt een gecorrigeerde config voor en start
// die als nieuwe fit. De lus zelf wordt client-side aangedreven (de fits-stap roept dit
// endpoint opnieuw aan zodra de nieuwe fit klaar is, tot de poort op "pass" staat of de
// rondelimiet is bereikt) — een fit duurt minuten, dus server-side wachten past niet in
// een serverless-tijdbudget. Mens-in-de-lus blijft: elke ronde is zichtbaar in de chat,
// de bouwer kan de cyclus elk moment stoppen, en publiceren blijft een handmatige actie.
export const maxDuration = 120;

// Harde bovengrens, ook al stuurt de client een hoger rondenummer mee: elke ronde kost
// een volledige Modal-fit, dus dit is de duurste lus in de app.
const MAX_FIT_REFINE_ROUNDS = 3;

function gateVerdict(summary: FitSummary): "pass" | "warn" | "fail" | null {
  return summary.quality_gate?.verdict ?? null;
}

async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const projectId: string | undefined = body?.project_id;
  const round: number = typeof body?.round === "number" ? body.round : 1;
  if (!projectId) {
    return NextResponse.json({ error: "project_id is verplicht" }, { status: 400 });
  }
  if (round > MAX_FIT_REFINE_ROUNDS) {
    return NextResponse.json({
      status: "exhausted",
      message: `De rondelimiet (${MAX_FIT_REFINE_ROUNDS}) is bereikt. Bekijk de laatste run en verfijn verder via de chat.`,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is niet geconfigureerd op de server." }, { status: 503 });
  }

  const supabase = createClient();

  // Dezelfde context als de chat-architect ziet, zodat de correctie op alles is gebaseerd
  // (profielen, inspectie, zakelijke context, run-historie) — niet alleen de foutmelding.
  const [
    { data: sources },
    { data: runRows },
    { data: latestFitJob },
    { data: latestDataset },
    { data: projectContext },
    { data: latestInspection },
  ] = await Promise.all([
    supabase
      .schema("mmm")
      .from("source_files")
      .select("id, project_id, name, storage_path, role_hint, preview, profile, mapping, created_at")
      .eq("project_id", projectId)
      .order("created_at"),
    supabase
      .schema("mmm")
      .from("model_runs")
      .select("summary, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .schema("mmm")
      .from("jobs")
      .select("status, error, config, created_at")
      .eq("project_id", projectId)
      .eq("type", "fit")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .schema("mmm")
      .from("datasets")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
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

  if (!latestFitJob) {
    return NextResponse.json({ error: "Er is nog geen fit om te verbeteren." }, { status: 400 });
  }
  const jobStatus = latestFitJob.status as JobStatus;
  if (jobStatus === "queued" || jobStatus === "running") {
    return NextResponse.json({ status: "waiting", message: "Er draait nog een berekening; wacht tot die klaar is." });
  }

  const latestRun = runRows?.[0] ?? null;
  const latestSummary = latestRun && !isHierSummary(latestRun.summary) ? (latestRun.summary as FitSummary) : null;

  // Klaar? Een geslaagde fit met kwaliteitspoort "pass" (of zonder poort) hoeft niet verder.
  const jobSucceededAfterRun =
    jobStatus === "succeeded" && latestRun != null && new Date(latestRun.created_at) >= new Date(latestFitJob.created_at);
  if (jobSucceededAfterRun && latestSummary && gateVerdict(latestSummary) !== "warn" && gateVerdict(latestSummary) !== "fail") {
    return NextResponse.json({
      status: "done",
      message: "De laatste berekening is geslaagd en de kwaliteitscontrole staat niet op warn/fail — niets te verbeteren. Beoordeel en publiceer wanneer je tevreden bent.",
    });
  }

  if (!(await hasJobCapacity(supabase))) {
    return NextResponse.json(
      { error: `Er draaien (of wachten) al ${MAX_CONCURRENT_JOBS} taken; probeer het zo weer.` },
      { status: 409 },
    );
  }

  const fit: ArchitectFitContext = {
    latestRun: latestRun
      ? { summary: latestRun.summary as FitSummary, created_at: latestRun.created_at as string }
      : null,
    latestJob: {
      status: jobStatus,
      error: (latestFitJob.error as string | null) ?? null,
      config: latestFitJob.config as JobConfig,
      created_at: latestFitJob.created_at as string,
    },
    previousRuns: (runRows ?? [])
      .slice(1)
      .filter((r) => !isHierSummary(r.summary))
      .map((r) => ({ summary: r.summary as FitSummary, created_at: r.created_at as string })),
  };
  const dataset: ArchitectDatasetContext = { latestDataset: (latestDataset as Dataset | null) ?? null };
  const sourceFiles = (sources ?? []) as SourceFile[];
  const previews = sourceFiles.map((f) => ({ file: f, preview: f.preview ?? null }));
  const businessContext = (projectContext as ProjectContext | null) ?? null;
  const inspection = (latestInspection as DataInspection | null) ?? null;

  const autoPrompt =
    `Automatische verbetercyclus, ronde ${round} van maximaal ${MAX_FIT_REFINE_ROUNDS}. ` +
    (jobStatus === "failed"
      ? "De laatste fit is MISLUKT. Diagnosticeer de oorzaak aan de hand van de foutmelding en roep propose_model_config aan met een gecorrigeerde configuratie die dit oplost."
      : "De laatste fit is afgerond maar de kwaliteitspoort staat op warn/fail. Diagnosticeer wat er mis is en roep propose_model_config aan met een gericht verbeterde configuratie — verander alleen wat de diagnose aanwijst en leg in reasoning uit wat je veranderde en waarom.") +
    " Als je géén verantwoorde verbetering ziet (bijvoorbeeld omdat het probleem in de data zit), roep dan geen tool aan maar leg dat uit.";

  const history: Anthropic.MessageParam[] = [{ role: "user", content: autoPrompt }];

  const client = new Anthropic({ apiKey });
  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      buildRequest({ sources: previews, dataset, fit, businessContext, inspection }, history),
    );
  } catch (err) {
    return NextResponse.json({ error: claudeErrorMessage(err) }, { status: 502 });
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "propose_model_config",
  );
  const replyText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n\n");

  // De hele ronde is zichtbaar in de projectchat, zodat de bouwer het spoor kan volgen en
  // op elk moment kan ingrijpen — het automatische karakter mag geen zwarte doos worden.
  const rowsToInsert: { project_id: string; role: "user" | "assistant"; content: unknown; created_by: string }[] = [
    { project_id: projectId, role: "user", content: [{ type: "text", text: autoPrompt }], created_by: viewer.id },
    { project_id: projectId, role: "assistant", content: response.content, created_by: viewer.id },
  ];

  if (!toolUse) {
    await supabase.schema("mmm").from("chat_messages").insert(rowsToInsert);
    return NextResponse.json({
      status: "stopped",
      message: replyText || "De AI zag geen verantwoorde automatische verbetering.",
    });
  }

  // Config uit de tool-call → nieuwe fit-job, exact zoals /api/jobs dat doet.
  const proposal = toolUse.input as { sources: unknown; model: unknown; event_dummies?: unknown; reasoning?: string };
  const config = { sources: proposal.sources, model: proposal.model, event_dummies: proposal.event_dummies ?? [] };

  const { data: job, error: jobErr } = await supabase
    .schema("mmm")
    .from("jobs")
    .insert({ project_id: projectId, type: "fit", config, created_by: viewer.id })
    .select("id")
    .single();

  rowsToInsert.push({
    project_id: projectId,
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: jobErr
          ? `De gecorrigeerde configuratie kon niet worden gestart: ${jobErr.message}`
          : "De gecorrigeerde configuratie is automatisch gestart als nieuwe fit.",
      },
    ],
    created_by: viewer.id,
  });
  await supabase.schema("mmm").from("chat_messages").insert(rowsToInsert);

  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 400 });
  }
  await nudgeModalEnqueue(job.id);

  return NextResponse.json({
    status: "refitted",
    job_id: job.id,
    round,
    reasoning: proposal.reasoning ?? replyText,
  });
}

export const POST = withJsonErrors(handlePost);
