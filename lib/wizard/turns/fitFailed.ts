// Fase "fit_failed" — de fout in gewone taal, met de vraag wat er nu moet gebeuren.
//
// Hergebruikt de tuning-turn (opnieuw afstemmen & rekenen) met daarboven de foutmelding en
// een extra optie om de AI te laten diagnosticeren. Die optie levert een VOORSTEL op, geen
// nieuwe berekening: in v1 startte deze knop rechtstreeks een fit met de configuratie die de
// AI zelf had bedacht, en de rondelimiet die dat moest begrenzen kwam uit de client.

import { humanizeError } from "@/lib/humanizeMessage";
import { postJson } from "@/lib/fetchJson";
import * as tuning from "@/lib/wizard/turns/tuning";
import type { TurnEnv, TurnReplyResult } from "@/lib/wizard/turns/types";

const REFINE_LABEL = "Laat de AI meekijken wat er misging";
const REFINE_SYNONYMS = ["verbeter", "refine", "diagnosticeer", "meekijken", "wat ging er mis"];

export function intro(env: TurnEnv): string {
  const failed = env.runs.find((r) => r.run.state === "failed");
  // `error_message` is al gebruikersvriendelijke tekst: de worker schrijft nooit een
  // traceback in dat veld (dat gaat naar error_technical, alleen voor de bouwer).
  const message = failed?.run.error_message ?? "De berekening is gestopt zonder duidelijke reden.";
  return `${message}\n\n0) ${REFINE_LABEL}\n\n${tuning.intro(env)}`;
}

// Losstaand van de genummerde tuning-opties (die blijven 1/2/3) om te voorkomen dat een
// getypt "1" hier per ongeluk als "optie 0" wordt gelezen.
function isRefineCommand(reply: string): boolean {
  const text = reply.trim().toLowerCase();
  return text === "0" || text === REFINE_LABEL.toLowerCase() || REFINE_SYNONYMS.some((s) => text.includes(s));
}

export async function resolve(env: TurnEnv, reply: string): Promise<TurnReplyResult> {
  if (isRefineCommand(reply)) {
    const res = await postJson<{ status: string; message?: string; reasoning?: string; intent?: unknown }>(
      "/api/fit-refine",
      { project_id: env.projectId },
    );
    if (!res.ok) {
      return { handled: true, reply: humanizeError(res.error, "De AI kon niet meekijken.").text };
    }
    if (res.data.status === "proposed") {
      return {
        handled: true,
        reply:
          `${res.data.reasoning ?? "Ik heb een aangepaste afstemming."}\n\n` +
          `Typ "ja" om hiermee opnieuw te rekenen, of beschrijf wat er anders moet.`,
        proposal: { kind: "intent", payload: res.data.intent },
      };
    }
    return { handled: true, reply: res.data.message ?? "Ik zie geen verantwoorde aanpassing." };
  }
  return tuning.resolve(env, reply);
}
