import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildRequest, parseBusinessContextInput } from "@/lib/anthropic/architect";
import type { ArchitectFitContext } from "@/lib/anthropic/fitContext";
import type { ArchitectDatasetContext } from "@/lib/anthropic/datasetContext";
import type {
  DataInspection,
  DatasetVersion,
  FitSummary,
  ModelValidation,
  ProjectContext,
  RunErrorCode,
  SourceFile,
} from "@/lib/types";
import { withJsonErrors, claudeErrorMessage } from "@/lib/apiRoute";

// Tool names the architect can call — kept here so the route and the frontend agree on
// what a "proposal" in the persisted/returned payload means. record_business_context is a
// side-effect tool (it persists elicited context) rather than a builder-facing proposal, so
// it is handled separately below but still needs a synthetic tool_result to keep history well-formed.
// Streaming keeps the connection open for the whole architect turn (thinking + text +
// tool call); give the route the same headroom as the other Claude routes.
export const maxDuration = 120;

const PROPOSAL_TOOLS = ["propose_prepare_recipe", "propose_model_intent"] as const;
const ALL_TOOLS = [...PROPOSAL_TOOLS, "record_business_context"] as const;

// Load prior chat history for a project so the panel survives a page refresh.
async function handleGet(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }
  const projectId = new URL(request.url).searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is verplicht" }, { status: 400 });
  }

  const supabase = createClient();
  const [{ data }, { data: srcCount }, { data: ds }, { data: run }, { data: bizCtx }, { data: inspect }] =
    await Promise.all([
      supabase
        .schema("mmm")
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("project_id", projectId)
        .order("created_at"),
      supabase.schema("mmm").from("source_files").select("id").eq("project_id", projectId),
      supabase
        .schema("mmm")
        .from("dataset_versions")
        .select("status, approved_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .schema("mmm")
        .from("model_runs")
        .select("id, state, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.schema("mmm").from("project_context").select("notes").eq("project_id", projectId).maybeSingle(),
      supabase
        .schema("mmm")
        .from("data_inspections")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "done")
        .limit(1)
        .maybeSingle(),
    ]);

  // A compact "wat ziet de architect nu?"-summary for the panel header: transparency about
  // the context every chat turn is grounded in, so the builder knows what they can refer to.
  let level: string | null = null;
  if (run?.id) {
    const { data: validation } = await supabase
      .schema("mmm")
      .from("model_validations")
      .select("level")
      .eq("model_run_id", run.id as string)
      .maybeSingle();
    level = (validation?.level as string | null) ?? null;
  }
  const context = {
    n_sources: srcCount?.length ?? 0,
    dataset_status: (ds?.status as string | null) ?? null,
    dataset_approved: Boolean(ds?.approved_at),
    last_run: run
      ? { date: (run.created_at as string).slice(0, 10), state: run.state as string, level }
      : null,
    n_business_notes: ((bizCtx?.notes as unknown[] | null) ?? []).length,
    has_inspection: Boolean(inspect),
  };

  return NextResponse.json({ messages: data ?? [], context });
}

async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const projectId: string | undefined = body?.project_id;
  const userMessage: string | undefined = body?.message;
  if (!projectId || !userMessage) {
    return NextResponse.json({ error: "project_id en message zijn verplicht" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is niet geconfigureerd op de server." },
      { status: 503 },
    );
  }

  const supabase = createClient();

  const [
    { data: sources },
    { data: priorRows },
    { data: runRows },
    { data: latestDataset },
    { data: projectContext },
    { data: latestInspection },
  ] = await Promise.all([
      supabase
        .schema("mmm")
        .from("source_files")
        .select("id, project_id, name, storage_path, preview, profile, mapping, inspection_confirmed_at, created_at")
        .eq("project_id", projectId)
        .order("created_at"),
      supabase
        .schema("mmm")
        .from("chat_messages")
        .select("role, content")
        .eq("project_id", projectId)
        .order("created_at"),
      // The newest runs give the architect its "resultaatinzicht": it can interpret a
      // finished run or diagnose a failed one. The newest is the full picture; the earlier
      // ones become a compact digest so it can compare ("is B beter dan A?") rather than
      // only seeing the last one.
      supabase
        .schema("mmm")
        .from("model_runs")
        .select("id, state, error_code, error_message, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(4),
      // The latest dataset version (recipe + suitability report) is the data-preparation
      // context — the step before modelling.
      supabase
        .schema("mmm")
        .from("dataset_versions")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Elicited business context (one row per project) and the latest deep data
      // inspection — the two "more brains" inputs the architect reasons over pre-fit.
      supabase
        .schema("mmm")
        .from("project_context")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle(),
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

  const runList = runRows ?? [];
  const latestRun = runList[0] ?? null;

  // Results and the verdict live in their own tables; a run row on its own says only what
  // happened, not what came out of it.
  const runIds = runList.map((r) => r.id as string);
  const [{ data: resultRows }, { data: validationRows }] = runIds.length
    ? await Promise.all([
        supabase.schema("mmm").from("model_results").select("model_run_id, summary").in("model_run_id", runIds),
        supabase.schema("mmm").from("model_validations").select("*").in("model_run_id", runIds),
      ])
    : [{ data: [] }, { data: [] }];
  const summaryByRun = new Map((resultRows ?? []).map((r) => [r.model_run_id as string, r.summary as FitSummary]));
  const validationByRun = new Map(
    (validationRows ?? []).map((v) => [v.model_run_id as string, v as unknown as ModelValidation]),
  );

  const latestSummary = latestRun ? summaryByRun.get(latestRun.id as string) ?? null : null;
  const fit: ArchitectFitContext = {
    latestRun: latestSummary
      ? { summary: latestSummary, created_at: latestRun!.created_at as string }
      : null,
    previousRuns: runList
      .slice(1)
      .map((r) => ({ summary: summaryByRun.get(r.id as string), created_at: r.created_at as string }))
      .filter((r): r is { summary: FitSummary; created_at: string } => Boolean(r.summary)),
    latestRunState: latestRun
      ? {
          state: latestRun.state as string,
          error_code: (latestRun.error_code as RunErrorCode | null) ?? null,
          error_message: (latestRun.error_message as string | null) ?? null,
          created_at: latestRun.created_at as string,
        }
      : null,
    validation: latestRun ? validationByRun.get(latestRun.id as string) ?? null : null,
  };
  const dataset: ArchitectDatasetContext = {
    latestDataset: (latestDataset as DatasetVersion | null) ?? null,
  };
  const businessContext = (projectContext as ProjectContext | null) ?? null;
  const inspection = (latestInspection as DataInspection | null) ?? null;

  const sourceFiles = (sources ?? []) as unknown as SourceFile[];
  // The preview is cached on the row at upload time (see SourceUpload.tsx) instead of
  // downloaded from Storage on every chat turn.
  const previews = sourceFiles.map((f) => ({ file: f, preview: f.preview ?? null }));

  const history: Anthropic.MessageParam[] = (priorRows ?? []).map((row) => ({
    role: row.role as "user" | "assistant",
    content: row.content as Anthropic.ContentBlockParam[],
  }));

  const newUserBlock: Anthropic.ContentBlockParam = { type: "text", text: userMessage };
  // Cache breakpoint on the newest turn: everything up to here becomes a readable
  // prefix for the *next* request in this conversation (see shared/prompt-caching.md —
  // "put a breakpoint on the last content block of the most-recently-appended turn").
  const cachedUserBlock: Anthropic.ContentBlockParam = {
    ...newUserBlock,
    cache_control: { type: "ephemeral" },
  };
  history.push({ role: "user", content: [cachedUserBlock] });

  const client = new Anthropic({ apiKey });

  // Stream the reply as NDJSON: {"type":"delta","text":...} per text chunk, one final
  // {"type":"done",...} carrying the proposals, or {"type":"error",...}. Streaming costs
  // no extra tokens — it only changes when the builder starts reading. Persistence and
  // tool side-effects run after the final message, exactly as the non-streaming version did.
  const encoder = new TextEncoder();
  // The builder can abort mid-stream (stop button / navigation); enqueueing on a
  // cancelled stream throws, so sends become no-ops from that point on — but the
  // persistence after finalMessage() still runs, so the turn is never half-saved.
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
    async start(controller) {
      const send = (obj: unknown) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          cancelled = true;
        }
      };
      try {
        const runner = client.messages.stream(
          buildRequest({ sources: previews, dataset, fit, businessContext, inspection }, history),
        );
        // Fase-signalen zodat de UI kan tonen WAT de architect aan het doen is (denken /
        // schrijven / een voorstel samenstellen) in plaats van alleen een stille stilte.
        // content_block_start markeert elke overgang; we sturen 'm door zodra hij bekend is.
        runner.on("streamEvent", (event) => {
          if (event.type !== "content_block_start") return;
          const block = event.content_block;
          if (block.type === "thinking") send({ type: "phase", phase: "thinking" });
          else if (block.type === "text") send({ type: "phase", phase: "text" });
          else if (block.type === "tool_use") send({ type: "phase", phase: "tool", tool: block.name });
        });
        // Denkstappen (extended thinking) worden apart gestreamd van de uiteindelijke
        // tekst, zodat de UI ze los kan tonen ("redenering") in plaats van te vermengen.
        runner.on("thinking", (delta) => send({ type: "thinking_delta", text: delta }));
        runner.on("text", (delta) => send({ type: "delta", text: delta }));
        const response = await runner.finalMessage();

        // Whichever tool the architect called (recipe / config / record_business_context) — at
        // most one, per the system prompt's design, but detect by name rather than assume.
        const toolUse = response.content.find(
          (b): b is Anthropic.ToolUseBlock =>
            b.type === "tool_use" && (ALL_TOOLS as readonly string[]).includes(b.name),
        );

        // record_business_context is a side-effect tool: persist the elicited context (upsert one
        // row per project) so it feeds every later architect turn and the config's priors.
        if (toolUse?.name === "record_business_context") {
          const parsed = parseBusinessContextInput(toolUse.input);
          if (parsed) {
            const { data: existing } = await supabase
              .schema("mmm")
              .from("project_context")
              .select("industry, notes")
              .eq("project_id", projectId)
              .maybeSingle();
            const mergedNotes = [
              ...(((existing?.notes as ProjectContext["notes"]) ?? []) as NonNullable<ProjectContext["notes"]>),
              ...parsed.notes,
            ];
            await supabase
              .schema("mmm")
              .from("project_context")
              .upsert(
                {
                  project_id: projectId,
                  industry: parsed.industry ?? (existing?.industry as string | null) ?? null,
                  notes: mergedNotes,
                  updated_by: viewer.id,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "project_id" },
              );
          }
        }
        const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
        // De architect schrijft soms GEEN los tekstblok als het antwoord uitsluitend een
        // tool-call is (bv. meteen een gecorrigeerd recept voorstellen zonder inleidende
        // zin) — dan zou de bubbel anders leeg/cryptisch blijven. Val in die volgorde
        // terug: het voorstel z'n eigen "reasoning"-veld (verplicht bij beide
        // propose_*-tools), dan de vaste bevestiging bij record_business_context, dan pas
        // een generieke, begrijpelijke melding.
        const toolReasoning =
          toolUse?.name !== "record_business_context"
            ? ((toolUse?.input as { reasoning?: string } | undefined)?.reasoning ?? null)
            : null;
        const replyText =
          textBlocks.map((b) => b.text).join("\n\n").trim() ||
          toolReasoning ||
          (toolUse?.name === "record_business_context" ? "Zakelijke context vastgelegd." : null) ||
          "Geen aanvullende toelichting dit keer — kijk hierboven of er al een voorstel klaarstaat, of vraag het opnieuw.";

        // Persist: the user's plain turn (uncached copy — cache_control is a request-time
        // hint, not meaningful to store), the assistant's full response, and — if a tool was
        // called — a synthetic tool_result so the stored history stays well-formed for the
        // next request (a tool_use with no matching tool_result is an incomplete turn).
        const rowsToInsert: { project_id: string; role: "user" | "assistant"; content: unknown; created_by: string }[] = [
          { project_id: projectId, role: "user", content: [newUserBlock], created_by: viewer.id },
          { project_id: projectId, role: "assistant", content: response.content, created_by: viewer.id },
        ];
        if (toolUse) {
          const resultText =
            toolUse.name === "record_business_context"
              ? "Zakelijke context vastgelegd."
              : "Voorstel ontvangen door de bouwer.";
          rowsToInsert.push({
            project_id: projectId,
            role: "user",
            content: [{ type: "tool_result", tool_use_id: toolUse.id, content: resultText }],
            created_by: viewer.id,
          });
        }
        await supabase.schema("mmm").from("chat_messages").insert(rowsToInsert);

        send({
          type: "done",
          reply: replyText,
          proposedIntent: toolUse?.name === "propose_model_intent" ? toolUse.input : null,
          proposedRecipe: toolUse?.name === "propose_prepare_recipe" ? toolUse.input : null,
          usage: response.usage,
        });
      } catch (err) {
        send({ type: "error", error: claudeErrorMessage(err) });
      } finally {
        try {
          controller.close();
        } catch {
          // Already cancelled/closed — nothing to do.
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const GET = withJsonErrors(handleGet);
export const POST = withJsonErrors(handlePost);
