import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { withJsonErrors } from "@/lib/apiRoute";

// Confirm the parameter-tuning step: persists the tuned model settings (adstock/
// saturation/priors per channel, baseline priors, trend/seasonality/likelihood — see
// TuningDraft in lib/types.ts) on the dataset and marks tuning as done, so the wizard's
// FSM (lib/wizard/phase.ts) can move on to "modelspec" (sampler settings) without losing
// the tuning choices in between. Only an approved dataset can have its tuning confirmed —
// tuning is meaningless before there is a definitive column set to tune against.
async function handlePost(request: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.tuning_draft || typeof body.tuning_draft !== "object") {
    return NextResponse.json({ error: "tuning_draft is verplicht" }, { status: 400 });
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
  if (dataset.status !== "approved") {
    return NextResponse.json(
      { error: `dataset heeft status '${dataset.status}', alleen een goedgekeurde dataset kan getuned worden` },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .schema("mmm")
    .from("datasets")
    .update({ tuning_draft: body.tuning_draft, tuning_confirmed_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export const POST = withJsonErrors(handlePost);
