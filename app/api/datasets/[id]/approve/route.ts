import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { withJsonErrors } from "@/lib/apiRoute";

// Approve a built dataset version: it becomes the definitive input for modelling.
//
// Only a 'ready' version can be approved, and only one per project can be approved at a
// time (enforced by a partial unique index). That single-approved rule is what makes
// "which data is this result based on" answerable at all.
async function handlePost(request: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const supabase = createClient();
  const { data: dataset } = await supabase
    .schema("mmm")
    .from("dataset_versions")
    .select("id, project_id, status, verdict")
    .eq("id", params.id)
    .maybeSingle();
  if (!dataset) {
    return NextResponse.json({ error: "dataset niet gevonden" }, { status: 404 });
  }
  if (dataset.status !== "ready") {
    return NextResponse.json(
      {
        error:
          dataset.status === "failed"
            ? "Deze samenvoeging is mislukt. Los eerst op wat er in het rapport staat."
            : "De samenvoeging loopt nog. Wacht tot die klaar is.",
      },
      { status: 409 },
    );
  }
  if (dataset.verdict === "not_usable") {
    return NextResponse.json(
      {
        error:
          "Deze dataset is niet geschikt om op te modelleren. Los eerst de blokkerende punten uit het rapport op.",
      },
      { status: 409 },
    );
  }

  // Approving a new version supersedes the previous one; the partial unique index would
  // otherwise reject the update and leave the user stuck on an older dataset.
  await supabase
    .schema("mmm")
    .from("dataset_versions")
    .update({ approved_at: null, approved_by: null })
    .eq("project_id", dataset.project_id)
    .not("approved_at", "is", null)
    .neq("id", params.id);

  const { error } = await supabase
    .schema("mmm")
    .from("dataset_versions")
    .update({ approved_at: new Date().toISOString(), approved_by: viewer.id })
    .eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export const POST = withJsonErrors(handlePost);
