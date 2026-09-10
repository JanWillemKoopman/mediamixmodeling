// Wat er in het logboek kan staan — gedeeld door de browser- en de serverkant.
// Zie supabase/migrations/0025_app_events.sql voor waarom het logboek bestaat.

export type LogLevel = "info" | "warn" | "error";
export type LogSource = "client" | "server";

/** Eén regel in het logboek, zoals hij de database in gaat. */
export interface LogEvent {
  session_id: string;
  source: LogSource;
  level: LogLevel;
  event: string;
  message: string | null;
  project_id: string | null;
  user_id: string | null;
  path: string | null;
  detail: Record<string, unknown>;
  /** Alleen gezet door de browserkant: wanneer het daar gebeurde (kan wachten op verzenden). */
  at?: string;
}

/** Wat de browser opstuurt; server vult sessie-onafhankelijke velden zelf aan. */
export type LogDraft = Pick<LogEvent, "level" | "event"> &
  Partial<Pick<LogEvent, "message" | "project_id" | "path" | "detail" | "at">>;

// Grenzen. Een logboek dat een pagina traag maakt of een database volschrijft, wordt
// uitgezet — en een uitgezet logboek helpt niemand. Daarom knippen we hier, niet later.
export const MAX_EVENTS_PER_BATCH = 50;
export const MAX_MESSAGE_CHARS = 2_000;
export const MAX_DETAIL_CHARS = 8_000;

export function truncate(value: unknown, max = MAX_MESSAGE_CHARS): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : String(value);
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}… [afgekapt, ${text.length} tekens]` : text;
}

/**
 * Maakt van een onbekend ding (een Error, een string, een afgewezen fetch) een leesbare
 * melding plus, als hij er is, de stacktrace. Nooit gooien: dit draait in foutafhandeling.
 */
export function describeError(err: unknown): { message: string; stack?: string; name?: string } {
  if (err instanceof Error) {
    return {
      message: err.message || err.name || "Error zonder melding",
      stack: err.stack ? truncate(err.stack, MAX_DETAIL_CHARS) ?? undefined : undefined,
      name: err.name,
    };
  }
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err) ?? String(err) };
  } catch {
    return { message: String(err) };
  }
}

/** Houdt `detail` binnen de perken; onserialiseerbare inhoud mag nooit een insert breken. */
export function safeDetail(detail: unknown): Record<string, unknown> {
  if (!detail || typeof detail !== "object") return {};
  try {
    const json = JSON.stringify(detail);
    if (json.length > MAX_DETAIL_CHARS) {
      return { afgekapt: true, tekens: json.length, fragment: json.slice(0, MAX_DETAIL_CHARS) };
    }
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { detail_niet_leesbaar: true };
  }
}
