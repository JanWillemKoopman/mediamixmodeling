import { createClient } from "@/lib/supabase/server";
import {
  describeError,
  safeDetail,
  truncate,
  type LogEvent,
  type LogLevel,
} from "@/lib/log/events";

// De serverkant van het logboek.
//
// Eén regel die overal geldt: loggen mag nooit de aanroep breken die het logt. Alles hier
// vangt zijn eigen fouten op en valt terug op console. Een logboek dat een verzoek kan laten
// mislukken, veroorzaakt precies de bugs die het zou moeten helpen vinden.

/** De sessie waar een serverfout bij hoort — de browser stuurt hem mee in deze header. */
export const SESSION_HEADER = "x-mmm-session";

/** Zonder sessie is een regel nog steeds bruikbaar; hij hangt dan alleen los in de tijdlijn. */
const NO_SESSION = "server";

export function sessionFromRequest(request: Request): string {
  try {
    return request.headers.get(SESSION_HEADER)?.slice(0, 64) || NO_SESSION;
  } catch {
    return NO_SESSION;
  }
}

/** Schrijft rijen weg. Faalt stil (met een console-spoor), nooit met een throw. */
export async function writeEvents(rows: LogEvent[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const supabase = createClient();
    const { error } = await supabase.schema("mmm").from("app_events").insert(rows);
    if (error) console.error("[logboek] wegschrijven mislukt:", error.message);
  } catch (err) {
    console.error("[logboek] wegschrijven mislukt:", err);
  }
}

interface ServerLogInput {
  request?: Request;
  level: LogLevel;
  event: string;
  message?: unknown;
  projectId?: string | null;
  userId?: string | null;
  path?: string | null;
  detail?: Record<string, unknown>;
}

function pathOf(request: Request | undefined, explicit: string | null | undefined): string | null {
  if (explicit) return explicit;
  if (!request) return null;
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

/**
 * Eén gebeurtenis vanaf de serverkant. Bewust `void`-baar: aanroepers hoeven er niet op te
 * wachten, en een trage insert mag een antwoord niet ophouden.
 */
export async function logServerEvent(input: ServerLogInput): Promise<void> {
  const path = pathOf(input.request, input.path);
  // Het logboek logt zichzelf niet: als /api/log stukloopt, zou dat een insert uitlokken die
  // op dezelfde manier stukloopt.
  if (path === "/api/log") return;

  if (input.level === "error") {
    console.error(`[logboek] ${input.event}`, input.message ?? "", input.detail ?? "");
  }

  await writeEvents([
    {
      session_id: input.request ? sessionFromRequest(input.request) : NO_SESSION,
      source: "server",
      level: input.level,
      event: input.event,
      message: truncate(input.message),
      project_id: input.projectId ?? null,
      user_id: input.userId ?? null,
      path,
      detail: safeDetail(input.detail),
    },
  ]);
}

/** Kortere vorm voor het geval dat het vaakst voorkomt: er ging iets mis. */
export async function logServerError(
  request: Request | undefined,
  event: string,
  err: unknown,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const described = describeError(err);
  await logServerEvent({
    request,
    level: "error",
    event,
    message: described.message,
    detail: { ...detail, stack: described.stack, naam: described.name },
  });
}
