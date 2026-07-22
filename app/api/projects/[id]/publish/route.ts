import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { withJsonErrors } from "@/lib/apiRoute";

// Publish a model run to the client dashboard: mark the run published and flip the
// project to 'published'. Builder-only (enforced by RLS and this guard).
//
// Delegates to the mmm.publish_run() RPC (0008_publish_run_rpc.sql) so the run update,
// project update, and un-publishing any previous "champion" run of this project happen
// atomically in one transaction — a partial failure can no longer leave the run and
// project status out of sync, and republishing a newer run always clears the older one.
async function handlePost(request: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.model_run_id) {
    return NextResponse.json({ error: "model_run_id is verplicht" }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase
    .schema("mmm")
    .rpc("publish_run", { p_project_id: params.id, p_model_run_id: body.model_run_id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export const POST = withJsonErrors(handlePost);
