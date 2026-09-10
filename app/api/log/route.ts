import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { MAX_EVENTS_PER_BATCH, safeDetail, truncate, type LogDraft, type LogEvent } from "@/lib/log/events";
import { writeEvents } from "@/lib/log/server";

/**
 * De brievenbus van het logboek: de browser levert hier zijn gebufferde gebeurtenissen af.
 *
 * Bewust NIET in `withJsonErrors` gewikkeld. Die wrapper schrijft bij een fout zelf een regel
 * in het logboek — als deze route stukloopt, zou dat een insert uitlokken die op precies
 * dezelfde manier stukloopt. Deze route vangt daarom zijn eigen fouten op en antwoordt altijd
 * met 200: een mislukte logregel is nooit iets waar de gebruiker last van mag hebben.
 */

const LEVELS = new Set(["info", "warn", "error"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { session_id?: unknown; events?: unknown };
    const sessionId = typeof body.session_id === "string" ? body.session_id.slice(0, 64) : "onbekend";
    const drafts = Array.isArray(body.events) ? (body.events.slice(0, MAX_EVENTS_PER_BATCH) as LogDraft[]) : [];
    if (drafts.length === 0) return NextResponse.json({ ok: true, opgeslagen: 0 });

    // Wie het was bepaalt de server, niet de browser: een client die zijn eigen user_id mag
    // opgeven, kan een logboek vervuilen met regels op andermans naam.
    const viewer = await getViewer().catch(() => null);

    const rows: LogEvent[] = drafts
      .filter((d) => d && typeof d.event === "string" && LEVELS.has(String(d.level)))
      .map((d) => ({
        session_id: sessionId,
        source: "client" as const,
        level: d.level,
        event: d.event.slice(0, 120),
        message: truncate(d.message),
        project_id: typeof d.project_id === "string" ? d.project_id : null,
        user_id: viewer?.id ?? null,
        path: typeof d.path === "string" ? d.path.slice(0, 512) : null,
        detail: safeDetail(d.detail),
        // De tijd van de handeling zelf, niet van het versturen — anders staan vijf
        // gebufferde klikken allemaal op dezelfde seconde en is de volgorde weg.
        at: typeof d.at === "string" ? d.at : new Date().toISOString(),
      }));

    await writeEvents(rows);
    return NextResponse.json({ ok: true, opgeslagen: rows.length });
  } catch (err) {
    console.error("[logboek] verwerken van een batch mislukt:", err);
    return NextResponse.json({ ok: false });
  }
}
