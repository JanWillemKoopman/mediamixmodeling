import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getViewer } from "@/lib/auth";
import { claudeErrorMessage, withJsonErrors } from "@/lib/apiRoute";
import { createClient } from "@/lib/supabase/server";
import { loadProjectSnapshot } from "@/lib/snapshot";
import { loadLedger } from "@/lib/flow/ledger";
import { deriveFlowState } from "@/lib/flow/state";
import { channelsOf } from "@/lib/flow/beliefs";
import {
  GUIDE_MODEL,
  GUIDE_SYSTEM,
  PRESET_ASK,
  briefing,
  proposeBeliefsTool,
} from "@/lib/ai/guide";
import { STEP_ORDER, type StepId } from "@/lib/flow/steps";

/**
 * Een vraag aan de gids.
 *
 * Dit is het enige pad waarlangs de AI in het traject aan bod komt, en het is altijd op
 * initiatief van de gebruiker: hij typt een vraag, of hij klikt een van de drie knoppen die om
 * een voorstel vragen (die sturen een vaste vraag, zie PRESET_ASK).
 *
 * De gids krijgt een briefing die uit de flow zelf wordt gegenereerd — welke stap, welke
 * knoppen, welke feiten — zodat hij niet kan adviseren over iets wat er niet is. Zijn enige
 * gereedschap is `propose_beliefs`, met uitsluitend enums.
 *
 * Een voorstel is een voorstel: deze route schrijft niets naar het grootboek en start niets.
 * De gebruiker ziet het ingevuld staan in de kaart en bevestigt zelf.
 */
export const maxDuration = 120;

async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const projectId: string | undefined = body?.project_id;
  const presetFor: string | undefined = body?.preset;
  const typed: string | undefined = body?.message;
  const message = presetFor ? PRESET_ASK[presetFor] : typed;
  if (!projectId || !message) {
    return NextResponse.json({ error: "project_id en een vraag zijn verplicht" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "De AI-gids is niet geconfigureerd op de server." }, { status: 503 });
  }

  const snapshot = await loadProjectSnapshot(projectId);
  if (!snapshot) return NextResponse.json({ error: "project niet gevonden" }, { status: 404 });

  const ledger = await loadLedger(projectId);
  const state = deriveFlowState(snapshot, ledger);
  // Waar de vraag over gaat: de stap waar de gebruiker naar kijkt als hij die meestuurt,
  // anders de stap waar hij staat.
  const viewing: StepId = STEP_ORDER.includes(body?.step) ? (body.step as StepId) : state.activeStepId;

  const supabase = createClient();
  // Het gesprek tot nu toe — inclusief de vaste gidsteksten, want die zijn onderdeel van wat
  // er is gezegd en de gids hoort zich niet te herhalen.
  const { data: history } = await supabase
    .schema("mmm")
    .from("chat_messages")
    .select("role, kind, content")
    .eq("project_id", projectId)
    .order("created_at")
    .limit(60);

  const turns: Anthropic.MessageParam[] = [];
  for (const row of history ?? []) {
    const content = row.content as unknown;
    const text =
      row.kind === "chat" && Array.isArray(content)
        ? (content as Anthropic.ContentBlockParam[])
            .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
            .map((b) => b.text)
            .join("\n")
        : ((content as { text?: string })?.text ?? "");
    if (!text.trim()) continue;
    turns.push({ role: row.role as "user" | "assistant", content: [{ type: "text", text }] });
  }

  const channels = snapshot.approvedDataset ? channelsOf(snapshot.approvedDataset).map((c) => c.name) : [];
  const system: Anthropic.TextBlockParam[] = [
    // De stabiele kern eerst, met een cache-breekpunt: byte-identiek bij elke aanvraag van elk
    // project, dus de ideale prefix om te hergebruiken.
    { type: "text", text: GUIDE_SYSTEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: briefing(snapshot, state, viewing) },
  ];

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();
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
        const runner = client.messages.stream({
          model: GUIDE_MODEL,
          max_tokens: 1500,
          system,
          tools: channels.length > 0 ? [proposeBeliefsTool(channels)] : [],
          messages: [...turns, { role: "user", content: [{ type: "text", text: message }] }],
        });
        runner.on("text", (delta) => send({ type: "delta", text: delta }));
        const response = await runner.finalMessage();

        const toolUse = response.content.find(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "propose_beliefs",
        );
        const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
        const reply =
          textBlocks.map((b) => b.text).join("\n\n").trim() ||
          ((toolUse?.input as { reasoning?: string } | undefined)?.reasoning ?? "") ||
          "Ik heb hier geen aanvulling op.";

        // Vastleggen in het transcript: de vraag en het antwoord, allebei als gewoon gesprek.
        // Een tool-aanroep wordt niet opgeslagen als tool-blok — het voorstel leeft in de kaart,
        // en het transcript hoeft geen ruwe JSON te dragen.
        await supabase.schema("mmm").from("chat_messages").insert([
          {
            project_id: projectId,
            role: "user",
            kind: "chat",
            step: viewing,
            content: [{ type: "text", text: message }],
            created_by: viewer.id,
          },
          {
            project_id: projectId,
            role: "assistant",
            kind: "chat",
            step: viewing,
            content: [{ type: "text", text: reply }],
            created_by: viewer.id,
          },
        ]);

        send({ type: "done", reply, proposal: toolUse ? toolUse.input : null });
      } catch (err) {
        send({ type: "error", error: claudeErrorMessage(err) });
      } finally {
        try {
          controller.close();
        } catch {
          // Al gesloten of afgebroken.
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const POST = withJsonErrors(handlePost);
