import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_CONCURRENT_DATASET_BUILDS, hasDatasetCapacity, nudgeWorker } from "@/lib/jobs";
import type { DatasetRecipe } from "@/lib/types";
import { withJsonErrors } from "@/lib/apiRoute";

// Create a new dataset version from a recipe. The row itself is the unit of work — there is
// no separate job table any more, which is what let v1's `jobs.status` and `datasets.status`
// drift apart while both claimed to describe the same merge.
//
// The recipe names source files by id, never by path. Paths are resolved in the worker from
// the rows of this project, so a recipe cannot reach a file it has no right to.
async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const projectId: string | undefined = body?.project_id;
  const recipe: DatasetRecipe | undefined = body?.recipe;
  if (!projectId || !recipe?.sources?.length) {
    return NextResponse.json(
      { error: "project_id en een recept met minimaal één bron zijn verplicht" },
      { status: 400 },
    );
  }

  const supabase = createClient();

  // Every source must belong to this project. Checked here as well as in the worker: the
  // worker's check is the boundary that matters, this one gives the user an immediate,
  // comprehensible answer instead of a failed build two minutes later.
  const sourceIds = recipe.sources.map((s) => s.source_file_id).filter(Boolean);
  if (sourceIds.length !== recipe.sources.length) {
    return NextResponse.json(
      { error: "elke bron in het recept moet een source_file_id hebben" },
      { status: 400 },
    );
  }
  const { data: owned } = await supabase
    .schema("mmm")
    .from("source_files")
    .select("id")
    .eq("project_id", projectId)
    .in("id", sourceIds);
  if ((owned ?? []).length !== sourceIds.length) {
    return NextResponse.json(
      { error: "het recept verwijst naar een bestand dat niet bij dit project hoort" },
      { status: 400 },
    );
  }

  if (!(await hasDatasetCapacity(supabase, projectId))) {
    return NextResponse.json(
      {
        error: `Er lopen al ${MAX_CONCURRENT_DATASET_BUILDS} voorbereidingen voor dit project. Wacht tot er één klaar is.`,
      },
      { status: 409 },
    );
  }

  const { data: versionNo, error: versionErr } = await supabase
    .schema("mmm")
    .rpc("next_dataset_version_no", { p_project_id: projectId });
  if (versionErr) {
    return NextResponse.json({ error: versionErr.message }, { status: 400 });
  }

  const { data: dataset, error } = await supabase
    .schema("mmm")
    .from("dataset_versions")
    .insert({
      project_id: projectId,
      version_no: versionNo,
      source_file_ids: sourceIds,
      recipe,
      status: "queued",
      created_by: viewer.id,
    })
    .select("id, version_no")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await nudgeWorker("dataset", dataset.id);
  return NextResponse.json({ dataset_version_id: dataset.id, version_no: dataset.version_no });
}

export const POST = withJsonErrors(handlePost);
