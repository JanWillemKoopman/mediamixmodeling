import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildClientSummaryRequest } from "@/lib/anthropic/clientSummary";
import { checkNumbers } from "@/lib/ai/numberCheck";
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
  let runQuery = supabase
    .schema("mmm")
    .from("model_results")
    .select("model_run_id, summary")
    .eq("project_id", projectId);
  runQuery = modelRunId
    ? runQuery.eq("model_run_id", modelRunId)
    : runQuery.order("created_at", { ascending: false }).limit(1);
  const { data: run } = await runQuery.maybeSingle();

  if (!run) {
    return NextResponse.json({ error: "Geen resultaat gevonden voor dit project." }, { status: 404 });
  }

  // A client-facing summary is a stronger claim than a screen full of numbers: it is written
  // to be forwarded, quoted and acted on. So it is gated on the verdict rather than produced
  // for anything that finished computing — which is what v1 did.
  const { data: validation } = await supabase
    .schema("mmm")
    .from("model_validations")
    .select("level, blocking_reasons")
    .eq("model_run_id", run.model_run_id as string)
    .maybeSingle();
  const level = validation?.level as string | undefined;
  if (level !== "statistically_valid" && level !== "usable_for_decisions") {
    return NextResponse.json(
      {
        error:
          "Deze berekening haalt de kwaliteitsdrempel niet, dus er wordt geen klantsamenvatting " +
          "van geschreven. " +
          ((validation?.blocking_reasons as string[] | null)?.[0] ?? ""),
      },
      { status: 409 },
    );
  }

  const summary = run.summary as FitSummary;
  const client = new Anthropic({ apiKey });
  const params = buildClientSummaryRequest(summary);

  // Twee pogingen, en dan de tekst laten vallen. Waarom: deze samenvatting is geschreven om
  // doorgestuurd en geciteerd te worden, en één verzonnen percentage erin is voor de lezer niet
  // te onderscheiden van een juist percentage (zie lib/ai/numberCheck.ts en
  // docs/CHAT_PIPELINE_HERZIENING.md §8.4). De cijfers zelf worden elders door code gerenderd,
  // dus het wegvallen van deze tekst kost uitleg — geen feiten.
  let text = "";
  let unverifiable: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create(params);
    } catch (err) {
      return NextResponse.json({ error: claudeErrorMessage(err) }, { status: 502 });
    }
    const candidate = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n\n");
    const check = checkNumbers(candidate, summary);
    if (check.ok) {
      text = candidate;
      unverifiable = [];
      break;
    }
    unverifiable = check.unverifiable;
  }

  if (!text) {
    return NextResponse.json(
      {
        error:
          "De samenvatting bevatte getallen die ik niet kan terugvinden in de uitkomst " +
          `(${unverifiable.slice(0, 5).join(", ")}), dus ik bewaar hem niet. De cijfers in het ` +
          "overzicht zelf zijn wel juist — die komen rechtstreeks uit de berekening.",
        unverifiable,
      },
      { status: 422 },
    );
  }

  const clientSummary: ClientSummary = {
    text,
    model: params.model,
    generated_at: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .schema("mmm")
    .from("model_results")
    .update({ client_summary: clientSummary })
    .eq("model_run_id", run.model_run_id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  return NextResponse.json({ client_summary: clientSummary });
}

export const POST = withJsonErrors(handlePost);
