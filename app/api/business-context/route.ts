import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { BusinessContextNote, ProjectContext } from "@/lib/types";
import { withJsonErrors } from "@/lib/apiRoute";

const TOPICS: BusinessContextNote["topic"][] = [
  "branche",
  "seizoen",
  "campagne",
  "offline_kanaal",
  "experiment",
  "prijs",
  "overig",
];

// Beheer van de zakelijke context vanuit het paneel in de wizard (stap 3): feiten
// toevoegen of verwijderen en de branche zetten. Zelfde rij (mmm.project_context) als
// waar de chat-tool record_business_context in schrijft, zodat AI en paneel één
// gedeelde waarheid hebben.
async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    project_id?: string;
    add?: { topic?: string; fact?: string; relates_to?: string | null };
    remove_index?: number;
    industry?: string;
    // Vrij-tekst bedrijfscontext (bovenaan stap 2). Lege string = wissen.
    description?: string;
    // Gemiddelde brutomarge in EURO'S per verkochte KPI-eenheid (bv. 12.50 per
    // order); null = wissen. Gaat naar mmm.projects.kpi_margin — hoort bij het
    // project, niet bij de losse contextfeiten.
    kpi_margin?: number | null;
  } | null;
  if (!body?.project_id) {
    return NextResponse.json({ error: "project_id is verplicht" }, { status: 400 });
  }

  const supabase = createClient();

  if (body.kpi_margin !== undefined) {
    const marge = body.kpi_margin;
    if (marge !== null && (typeof marge !== "number" || !(marge > 0) || !Number.isFinite(marge))) {
      return NextResponse.json({ error: "de marge moet een bedrag boven 0 zijn (bv. 12,50)" }, { status: 400 });
    }
    const { error: marginErr } = await supabase
      .schema("mmm")
      .from("projects")
      .update({ kpi_margin: marge })
      .eq("id", body.project_id);
    if (marginErr) {
      return NextResponse.json({ error: marginErr.message }, { status: 400 });
    }
  }
  const { data: existing } = await supabase
    .schema("mmm")
    .from("project_context")
    .select("industry, notes, description")
    .eq("project_id", body.project_id)
    .maybeSingle();

  let notes = [...(((existing?.notes as ProjectContext["notes"]) ?? []) as BusinessContextNote[])];
  let industry = (existing?.industry as string | null) ?? null;
  let description = (existing?.description as string | null) ?? null;

  if (body.add) {
    const fact = typeof body.add.fact === "string" ? body.add.fact.trim().slice(0, 1000) : "";
    if (!fact) return NextResponse.json({ error: "een feit mag niet leeg zijn" }, { status: 400 });
    const topic = TOPICS.includes(body.add.topic as BusinessContextNote["topic"])
      ? (body.add.topic as BusinessContextNote["topic"])
      : "overig";
    const relates = typeof body.add.relates_to === "string" && body.add.relates_to.trim() ? body.add.relates_to.trim().slice(0, 200) : null;
    notes.push({ topic, fact, relates_to: relates });
  }
  if (typeof body.remove_index === "number") {
    notes = notes.filter((_, i) => i !== body.remove_index);
  }
  if (typeof body.industry === "string") {
    industry = body.industry.trim().slice(0, 200) || null;
  }
  if (typeof body.description === "string") {
    description = body.description.trim().slice(0, 8000) || null;
  }

  const { error } = await supabase
    .schema("mmm")
    .from("project_context")
    .upsert(
      {
        project_id: body.project_id,
        industry,
        notes,
        description,
        updated_by: viewer.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, notes, industry, description });
}

export const POST = withJsonErrors(handlePost);
