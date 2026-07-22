// Safe JSON fetch for client components. Platform layers (Vercel timeouts, proxies)
// can answer with plain text like "An error occurred with your deployment" — a blind
// `res.json()` then throws "Unexpected token 'A' … is not valid JSON" and takes the UI
// down with it. This helper always resolves to a usable shape.
export interface JsonResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  /** Parsed body when it was valid JSON, otherwise `{}`. */
  data: T;
  /** A user-facing (Dutch) error message when ok is false. */
  error: string | null;
}

function fallbackMessage(status: number): string {
  if (status === 504 || status === 502 || status === 500) {
    return "De server kon dit niet op tijd afronden. Probeer het opnieuw — grote datasets of drukte kunnen dit veroorzaken.";
  }
  if (status === 413) {
    return "Het bestand of verzoek is te groot voor de server.";
  }
  return "Er ging iets mis in de communicatie met de server. Probeer het opnieuw.";
}

export async function fetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<JsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return {
      ok: false,
      status: 0,
      data: {} as T,
      error: "Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw.",
    };
  }
  const text = await res.text().catch(() => "");
  let data: T = {} as T;
  let parsed = false;
  try {
    data = JSON.parse(text) as T;
    parsed = true;
  } catch {
    // Non-JSON body (platform error page) — fall through to the status-based message.
  }
  if (res.ok) {
    return { ok: true, status: res.status, data, error: null };
  }
  const serverError = parsed ? (data as { error?: unknown })?.error : null;
  return {
    ok: false,
    status: res.status,
    data,
    error: typeof serverError === "string" && serverError ? serverError : fallbackMessage(res.status),
  };
}

export function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<JsonResult<T>> {
  return fetchJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
