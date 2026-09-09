// Het transcript: het gesprek zoals het in de database staat.
//
// In de oude wizard was het gespreksverloop React-state (components/wizard/ChatWizard.tsx),
// en de route die de opgeslagen historie teruggaf werd nergens aangeroepen. Bij een page
// load zag de gebruiker één bubbel en verder niets — geen spoor van wat hij had besloten.
//
// Hier is er geen client-state meer om te verliezen: de conversatie wordt server-side
// gerenderd uit mmm.chat_messages. Dat is de hele reparatie van die categorie.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { STEP_ORDER, type StepId } from "@/lib/flow/steps";

/**
 * Wat voor soort regel dit is (zie 0024_flow_ledger.sql):
 *  - `guide`    de vaste begeleidende tekst van een stap (0 tokens)
 *  - `decision` wat de gebruiker heeft gekozen
 *  - `result`   een uitkomstkaart; verwijst naar een run, draagt zelf geen cijfers
 *  - `chat`     vrij gesprek met de gids
 */
export type TranscriptKind = "chat" | "guide" | "decision" | "result";

export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant";
  kind: TranscriptKind;
  step: StepId | null;
  text: string;
  /** Alleen bij `result`: welke berekening. De cijfers blijven in model_results staan. */
  runId: string | null;
  created_at: string;
}

const KNOWN_STEPS = new Set<string>(STEP_ORDER);

/**
 * Anthropic-contentblokken terugbrengen tot leesbare tekst.
 *
 * De bestaande 90 regels in de database staan in dit formaat. Ze blijven leesbaar; ze weten
 * alleen niet bij welke stap ze hoorden, want dat is destijds nooit vastgelegd.
 */
function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content as Anthropic.ContentBlockParam[]) {
    if (block.type === "text") parts.push(block.text);
    // tool_use / tool_result / thinking horen niet in het zichtbare verhaal thuis: het
    // voorstel zelf verschijnt als een kaart, niet als ruwe JSON.
  }
  return parts.join("\n\n").trim();
}

export async function loadTranscript(projectId: string): Promise<TranscriptEntry[]> {
  const supabase = createClient();
  const { data } = await supabase
    .schema("mmm")
    .from("chat_messages")
    .select("id, role, content, step, kind, created_at")
    .eq("project_id", projectId)
    .order("created_at");

  const entries: TranscriptEntry[] = [];
  for (const row of data ?? []) {
    const kind = ((row.kind as string | null) ?? "chat") as TranscriptKind;
    const step = row.step as string | null;
    const content = row.content as unknown;

    // guide/decision/result schrijven een eenvoudige vorm weg: { text, run_id? }. Alleen
    // 'chat' draagt Anthropic-blokken.
    const simple = kind !== "chat" && content !== null && typeof content === "object" && !Array.isArray(content)
      ? (content as { text?: string; run_id?: string })
      : null;

    const text = simple ? (simple.text ?? "") : contentToText(content);
    // Een lege regel toont niets en verwart alleen (een beurt die alleen een tool-call was).
    if (!text) continue;

    entries.push({
      id: row.id as string,
      role: row.role as "user" | "assistant",
      kind,
      step: step && KNOWN_STEPS.has(step) ? (step as StepId) : null,
      text,
      runId: simple?.run_id ?? null,
      created_at: row.created_at as string,
    });
  }
  return entries;
}

/** Eén regel aan het transcript toevoegen. */
export async function appendTranscript(
  projectId: string,
  entry: {
    role: "user" | "assistant";
    kind: Exclude<TranscriptKind, "chat">;
    step: StepId;
    text: string;
    runId?: string;
  },
  userId: string,
): Promise<void> {
  const supabase = createClient();
  await supabase
    .schema("mmm")
    .from("chat_messages")
    .insert({
      project_id: projectId,
      role: entry.role,
      kind: entry.kind,
      step: entry.step,
      content: entry.runId ? { text: entry.text, run_id: entry.runId } : { text: entry.text },
      created_by: userId,
    });
}

/**
 * Staat de openingstekst van deze stap al in het transcript?
 *
 * De gids opent elke stap één keer. Zonder deze controle zou elke paginabezoek of elke
 * terugkeer naar een stap de tekst opnieuw onderaan plakken — het gesprek zou zichzelf gaan
 * herhalen, wat precies het tegenovergestelde is van een leesbaar verhaal.
 */
export async function hasGuideFor(projectId: string, step: StepId): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .schema("mmm")
    .from("chat_messages")
    .select("id")
    .eq("project_id", projectId)
    .eq("step", step)
    .eq("kind", "guide")
    .limit(1)
    .maybeSingle();
  return data != null;
}
