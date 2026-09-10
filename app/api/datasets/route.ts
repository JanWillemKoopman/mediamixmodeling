import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createDatasetVersion } from "@/lib/datasets";
import type { DatasetRecipe } from "@/lib/types";
import { withJsonErrors } from "@/lib/apiRoute";

// Create a new dataset version from a recipe. The row itself is the unit of work — there is
// no separate job table any more, which is what let v1's `jobs.status` and `datasets.status`
// drift apart while both claimed to describe the same merge.
//
// The work itself lives in lib/datasets.ts, because the flow route (app/api/flow) needs the
// same thing and two implementations of "make a dataset version" would drift the same way.
async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const projectId: string | undefined = body?.project_id;
  const recipe: DatasetRecipe | undefined = body?.recipe;
  if (!projectId || !recipe) {
    return NextResponse.json(
      { error: "project_id en een recept met minimaal één bron zijn verplicht" },
      { status: 400 },
    );
  }

  const result = await createDatasetVersion(createClient(), projectId, recipe, viewer.id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    dataset_version_id: result.datasetVersionId,
    version_no: result.versionNo,
  });
}

export const POST = withJsonErrors(handlePost);
