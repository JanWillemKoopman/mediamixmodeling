"use client";

import {
  MAX_EVENTS_PER_BATCH,
  describeError,
  safeDetail,
  truncate,
  type LogDraft,
  type LogLevel,
} from "@/lib/log/events";

// De browserkant van het logboek.
//
// Drie eisen, in deze volgorde:
//   1. Het mag de app nooit stukmaken. Alles hier vangt zijn eigen fouten; een logboek dat
//      kan gooien, verplaatst het probleem alleen maar.
//   2. Het mag niets kosten in beeld. Gebeurtenissen gaan in een buffer en worden gebundeld
//      verstuurd, niet één netwerkverzoek per klik.
//   3. Het mag niets verliezen bij het sluiten van het tabblad — juist de laatste handeling
//      vóór een crash is de interessantste. Vandaar sendBeacon bij het verlaten.

const SESSION_KEY = "mmm.logboek.sessie";
const FLUSH_MS = 4_000;

let buffer: LogDraft[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let installed = false;
/** Voorkomt dat een fout ín het loggen zichzelf opnieuw logt. */
let reentrant = false;

/**
 * Het label van deze testsessie. Kort en uitspreekbaar, want de gebruiker leest hem voor
 * ("kijk eens in sessie s-7f3a2c"). Per tabblad, zodat twee tests niet door elkaar lopen.
 */
export function sessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = `s-${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Privémodus of geblokkeerde opslag: dan maar een sessie die niet blijft hangen.
    return "s-tijdelijk";
  }
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_MS);
}

/** Stuurt de buffer op. `beacon` voor het geval dat de pagina onder je handen verdwijnt. */
export function flush(beacon = false): void {
  if (typeof window === "undefined" || buffer.length === 0) return;
  const batch = buffer.slice(0, MAX_EVENTS_PER_BATCH);
  buffer = buffer.slice(MAX_EVENTS_PER_BATCH);
  const body = JSON.stringify({ session_id: sessionId(), events: batch });

  try {
    if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/log", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Het logboek is niet bereikbaar. Dat is jammer, maar niet iets om de gebruiker mee
      // lastig te vallen — en zeker niets om opnieuw te proberen te loggen.
    });
  } catch {
    /* zie boven */
  }
  if (buffer.length > 0) schedule();
}

/** Eén gebeurtenis in het logboek. Veilig aan te roepen vanaf elke klik-handler. */
export function logEvent(draft: LogDraft): void {
  if (typeof window === "undefined") return;
  try {
    buffer.push({
      ...draft,
      message: truncate(draft.message),
      detail: safeDetail(draft.detail),
      path: draft.path ?? window.location.pathname,
      at: draft.at ?? new Date().toISOString(),
    });
    // Een fout wachtend in een buffer helpt niemand als de pagina meteen daarna crasht.
    if (draft.level === "error") flush();
    else schedule();
  } catch {
    /* loggen mag nooit de aanroeper breken */
  }
}

/** Wat de gebruiker deed: een klik, een keuze, een verstuurd formulier. */
export function logAction(event: string, detail: Record<string, unknown> = {}, projectId?: string): void {
  logEvent({ level: "info", event, detail, project_id: projectId ?? null });
}

/** Wat er misging, waar dan ook in de browser. */
export function logError(
  event: string,
  err: unknown,
  detail: Record<string, unknown> = {},
  projectId?: string,
): void {
  const described = describeError(err);
  logEvent({
    level: "error",
    event,
    message: described.message,
    detail: { ...detail, stack: described.stack, naam: described.name },
    project_id: projectId ?? null,
  });
}

/**
 * Zet de vangnetten die de gebruiker níét zelf hoeft aan te roepen: onafgevangen fouten,
 * afgewezen promises, en alles wat React of een bibliotheek naar console.error schrijft
 * (daar landen hydration-fouten en React-waarschuwingen — vaak de eerste aanwijzing dat er
 * iets scheef staat, en anders alleen zichtbaar voor wie de console openhad).
 *
 * Idempotent: twee keer aanroepen installeert niets dubbel.
 */
export function installGlobalLogging(): () => void {
  if (typeof window === "undefined" || installed) return () => {};
  installed = true;

  const onError = (ev: ErrorEvent) => {
    logError("window.error", ev.error ?? ev.message, {
      bestand: ev.filename,
      regel: ev.lineno,
      kolom: ev.colno,
    });
  };
  const onRejection = (ev: PromiseRejectionEvent) => {
    logError("promise.rejected", ev.reason);
  };
  const onHide = () => flush(true);

  const nativeError = console.error.bind(console);
  const nativeWarn = console.warn.bind(console);
  const relay = (level: LogLevel, native: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      native(...args);
      if (reentrant) return;
      reentrant = true;
      try {
        // Het eigen spoor van het logboek hoeft niet in het logboek.
        const first = typeof args[0] === "string" ? args[0] : "";
        if (!first.startsWith("[logboek]")) {
          const parts = args.map((a) => (a instanceof Error ? describeError(a).message : safeText(a)));
          logEvent({
            level,
            event: level === "error" ? "console.error" : "console.warn",
            message: parts.join(" "),
            detail: { stack: args.find((a) => a instanceof Error) ? describeError(args.find((a) => a instanceof Error)).stack : undefined },
          });
        }
      } finally {
        reentrant = false;
      }
    };

  console.error = relay("error", nativeError) as typeof console.error;
  console.warn = relay("warn", nativeWarn) as typeof console.warn;
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });

  return () => {
    console.error = nativeError as typeof console.error;
    console.warn = nativeWarn as typeof console.warn;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("pagehide", onHide);
    installed = false;
  };
}

function safeText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * `fetch` met een logboekregel eromheen. Vervangt de kale fetch op elke plek waar de
 * gebruiker iets in gang zet.
 *
 * Wat het toevoegt: de sessiekop (zodat een serverfout op dezelfde tijdlijn belandt als de
 * klik die hem uitlokte), de duur in milliseconden (traag is ook een bug), en een regel bij
 * elke mislukking — ook als de UI die mislukking netjes opvangt en de gebruiker niets ziet.
 */
export async function loggedFetch(url: string, init: RequestInit = {}, projectId?: string): Promise<Response> {
  const started = Date.now();
  const headers = new Headers(init.headers);
  headers.set("x-mmm-session", sessionId());
  try {
    const res = await fetch(url, { ...init, headers });
    const ms = Date.now() - started;
    if (!res.ok) {
      logEvent({
        level: "error",
        event: "api.mislukt",
        message: `${init.method ?? "GET"} ${url} → ${res.status}`,
        detail: { url, status: res.status, ms },
        project_id: projectId ?? null,
      });
    } else if (ms > 5_000) {
      logEvent({
        level: "warn",
        event: "api.traag",
        message: `${url} duurde ${ms} ms`,
        detail: { url, ms },
        project_id: projectId ?? null,
      });
    }
    return res;
  } catch (err) {
    logError("api.onbereikbaar", err, { url, ms: Date.now() - started }, projectId);
    throw err;
  }
}
