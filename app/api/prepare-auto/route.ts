import { NextResponse } from "next/server";
import { withJsonErrors, claudeErrorMessage } from "@/lib/apiRoute";
import Anthropic from "@anthropic-ai/sdk";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildRequest } from "@/lib/anthropic/architect";
import type { ArchitectFitContext } from "@/lib/anthropic/fitContext";
import type {
  DataInspection,
  PrepareRecipe,
  ProjectContext,
  SourceFile,
} from "@/lib/types";

// Preview-first data preparation (point 3). The architect proposes ONE complete merge
// recipe — which files, column roles, cleaning steps, derived variables and event dummies —
// and returns it WITHOUT executing anything: no dataset row, no merge job, no side effects.
//
// The builder then reviews every proposed change in the UI and ticks the ones to keep; only
// when they confirm does a single merge run (via /api/datasets), producing the prepared
// dataset they check (2c) and approve (2d). This deliberately replaces the older agentic
// auto-merge loop, which committed datasets each round to self-correct from the quality
// report — useful, but it fought with the builder's wish to see and consciously accept each
// change before anything touched their data. Refinement of a merged result now happens at
// 2c (quality report + deep inspection) and in the chat, where the loop is a better fit.
export const maxDuration = 120;

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
    return NextResponse.json({ error: "ANTHROPIC_API_KEY niet geconfigureerd." }, { status: 503 });
  }

  const supabase = createClient();

  // Load the same pre-fit context the chat architect sees, so the proposal reasons from the
  // profiles, mapping, deep inspection and business context too.
  const [{ data: sources }, { data: projectContext }, { data: latestInspection }] = await Promise.all([
    supabase
      .schema("mmm")
      .from("source_files")
      .select("id, project_id, name, storage_path, role_hint, preview, profile, mapping, created_at")
      .eq("project_id", projectId)
      .order("created_at"),
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

  const sourceFiles = (sources ?? []) as SourceFile[];
  if (sourceFiles.length === 0) {
    return NextResponse.json({ error: "Upload eerst bronbestanden." }, { status: 400 });
  }
  const previews = sourceFiles.map((f) => ({ file: f, preview: f.preview ?? null }));
  const businessContext = (projectContext as ProjectContext | null) ?? null;
  const inspection = (latestInspection as DataInspection | null) ?? null;
  const emptyFit: ArchitectFitContext = { latestRun: null, latestJob: null, priorPredictive: null };

  const client = new Anthropic({ apiKey });
  const history: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        "Stel met de tool propose_prepare_recipe één volledig samenvoeg-recept voor deze bronnen voor: kies per kolom een rol, voeg de nodige opschoonstappen toe, laat sterk samenhangende of ongeschikte kolommen weg, en stel waar relevant afgeleide variabelen en event-dummy's voor. Voer niets uit — de gebruiker beoordeelt straks elke aanpassing en kiest wat er wél en niet wordt uitgevoerd. Geef vóór het toolgebruik in enkele korte zinnen je onderbouwing: waaróm deze rollen, weglatingen en dummy's. Schrijf begrijpelijk voor een niet-technische gebruiker.",
    },
  ];

  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      buildRequest(
        { sources: previews, dataset: { latestDataset: null }, fit: emptyFit, businessContext, inspection },
        history,
      ),
    );
  } catch (err) {
    return NextResponse.json({ error: claudeErrorMessage(err) }, { status: 502 });
  }

  // De onderbouwing van de architect (vrije tekst naast het toolgebruik) — dit is de
  // transparantie die de review-lijst nodig heeft: waaróm dit voorstel.
  const reasoning = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "propose_prepare_recipe",
  );

  if (!toolUse) {
    // De architect had geen recept maar wel een boodschap (bv. een vraag om meer info) —
    // geef die terug zodat de gebruiker weet waarom er geen voorstel is.
    return NextResponse.json({
      recipe: null,
      reasoning: reasoning || "De AI kon nog geen voorstel doen. Vraag het na in de chat, of vul de rollen handmatig in.",
    });
  }

  const recipe = toolUse.input as PrepareRecipe;
  return NextResponse.json({ recipe, reasoning });
}

export const POST = withJsonErrors(handlePost);
