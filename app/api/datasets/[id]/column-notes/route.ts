import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { withJsonErrors } from "@/lib/apiRoute";

// Sla de zakelijke kolomnotities van de bouwer op bij de dataset. Notities zijn
// metadata (geen onderdeel van het samenvoegresultaat), dus ze mogen op elke bestaande
// dataset worden bijgewerkt — ook een al goedgekeurde.
async function handlePost(request: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { notes?: Record<string, unknown> } | null;
  if (!body || typeof body.notes !== "object" || body.notes === null || Array.isArray(body.notes)) {
    return NextResponse.json({ error: "notes (object van kolomnaam → tekst) is verplicht" }, { status: 400 });
  }
  // Alleen niet-lege tekstnotities bewaren; lege invoer = notitie verwijderd.
  const notes: Record<string, string> = {};
  for (const [col, val] of Object.entries(body.notes)) {
    if (typeof val === "string" && val.trim().length > 0) notes[col] = val.trim().slice(0, 500);
  }

  const supabase = createClient();
  const { error } = await supabase
    .schema("mmm")
    .from("datasets")
    .update({ column_notes: Object.keys(notes).length > 0 ? notes : null })
    .eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export const POST = withJsonErrors(handlePost);
