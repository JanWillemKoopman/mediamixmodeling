import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { withJsonErrors } from "@/lib/apiRoute";

// Approve a prepared dataset: it becomes the definitive input for the model step. Only a
// 'prepared' dataset can be approved — approving mid-flight or failed data would let a
// half-checked or broken merge silently become the modelling input.
async function handlePost(request: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const supabase = createClient();
  const { data: dataset, error: fetchErr } = await supabase
    .schema("mmm")
    .from("datasets")
    .select("id, status")
    .eq("id", params.id)
    .maybeSingle();
  if (fetchErr || !dataset) {
    return NextResponse.json({ error: "dataset niet gevonden" }, { status: 404 });
  }
  if (dataset.status !== "prepared") {
    return NextResponse.json(
      { error: `dataset heeft status '${dataset.status}', alleen een 'prepared' dataset kan goedgekeurd worden` },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .schema("mmm")
    .from("datasets")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export const POST = withJsonErrors(handlePost);
