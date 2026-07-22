import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_CONCURRENT_JOBS, hasJobCapacity, nudgeModalEnqueue } from "@/lib/jobs";
import type { PrepareRecipe } from "@/lib/types";
import { withJsonErrors } from "@/lib/apiRoute";

// Create a dataset (status 'preparing') from a recipe, and enqueue the 'prepare' job that
// merges + quality-checks it. Mirrors /api/jobs (same capacity check — prepare and fit
// jobs share one Modal container pool, see lib/jobs.ts).
async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const projectId: string | undefined = body?.project_id;
  const recipe: PrepareRecipe | undefined = body?.recipe;
  if (!projectId || !recipe?.sources?.length) {
    return NextResponse.json(
      { error: "project_id en een recept met minimaal één bron zijn verplicht" },
      { status: 400 },
    );
  }

  const supabase = createClient();

  if (!(await hasJobCapacity(supabase))) {
    return NextResponse.json(
      {
        error: `Er draaien (of wachten) al ${MAX_CONCURRENT_JOBS} taken (fits/voorbereidingen). Wacht tot er een klaar is voordat je een nieuwe start.`,
      },
      { status: 409 },
    );
  }

  const { data: dataset, error: datasetErr } = await supabase
    .schema("mmm")
    .from("datasets")
    .insert({ project_id: projectId, recipe, status: "preparing", created_by: viewer.id })
    .select("id")
    .single();
  if (datasetErr) {
    return NextResponse.json({ error: datasetErr.message }, { status: 400 });
  }

  const { data: job, error: jobErr } = await supabase
    .schema("mmm")
    .from("jobs")
    .insert({
      project_id: projectId,
      type: "prepare",
      dataset_id: dataset.id,
      config: { dataset_id: dataset.id, ...recipe },
      created_by: viewer.id,
    })
    .select("id")
    .single();
  if (jobErr) {
    // Roll the dataset back to draft rather than leaving it stuck on 'preparing' with no
    // job behind it — the builder can retry from a clean state.
    await supabase.schema("mmm").from("datasets").update({ status: "draft" }).eq("id", dataset.id);
    return NextResponse.json({ error: jobErr.message }, { status: 400 });
  }

  await nudgeModalEnqueue(job.id);
  return NextResponse.json({ dataset_id: dataset.id, job_id: job.id });
}

export const POST = withJsonErrors(handlePost);
