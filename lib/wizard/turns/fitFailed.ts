// Fase "fit_failed" — hergebruikt de hele tuning-turn (opnieuw instellen & berekenen), met
// de foutmelding erboven en een extra menu-optie om de architect te laten diagnosticeren en
// automatisch een gecorrigeerde berekening te starten (zelfde route als de review-fase se
// "Laat de AI dit verbeteren").

import { humanizeError } from "@/lib/humanizeMessage";
import { postJson } from "@/lib/fetchJson";
import * as tuning from "@/lib/wizard/turns/tuning";
import type { TurnEnv, TurnReplyResult } from "@/lib/wizard/turns/types";

const REFINE_LABEL = "Laat de AI dit verbeteren";
const REFINE_SYNONYMS = ["verbeter", "refine", "diagnosticeer", "laat de ai dit verbeteren"];

export function intro(env: TurnEnv): string {
  const error = env.jobs.find((j) => (j.type === "fit" || j.type === "fit_hierarchical") && j.status === "failed")?.error;
  return `De berekening is niet gelukt: ${error ?? "onbekende fout"}.\n\n0) ${REFINE_LABEL}\n\n${tuning.intro(env)}`;
}

// Losstaand van de genummerde tuning-opties (die blijven 1/2/3) om te voorkomen dat een
// getypt "1" hier per ongeluk als "optie 0" wordt gelezen — vandaar een eigen, expliciete
// check op "0" en de synoniemen in plaats van het gedeelde matchOption-mechanisme.
function isRefineCommand(reply: string): boolean {
  const text = reply.trim().toLowerCase();
  return text === "0" || text === REFINE_LABEL.toLowerCase() || REFINE_SYNONYMS.some((s) => text.includes(s));
}

export async function resolve(env: TurnEnv, reply: string): Promise<TurnReplyResult> {
  if (isRefineCommand(reply)) {
    const res = await postJson<{ status?: string; message?: string; reasoning?: string }>("/api/fit-refine", {
      project_id: env.projectId,
      round: 1,
    });
    if (!res.ok) return { handled: true, reply: humanizeError(res.error, "De automatische verbetering is niet gelukt.").text };
    if (res.data.status === "refitted") {
      return {
        handled: true,
        refresh: true,
        reply: res.data.reasoning ? `Een gecorrigeerde berekening is gestart. ${res.data.reasoning}` : "Een gecorrigeerde berekening is gestart.",
      };
    }
    return { handled: true, reply: res.data.message ?? "Geen verdere verbetering mogelijk." };
  }
  return tuning.resolve(env, reply);
}
