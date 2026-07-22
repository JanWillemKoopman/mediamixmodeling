import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_CONCURRENT_JOBS, hasJobCapacity, nudgeModalEnqueue } from "@/lib/jobs";
import { withJsonErrors } from "@/lib/apiRoute";

// 'fit'/'fit_hierarchical' run a full Bayesian fit; 'prior_predictive' is the cheap pre-fit
// sanity check (KPI range implied by the priors, no MCMC) — all share the same queue + config shape.
const ALLOWED_FIT_JOB_TYPES = ["fit", "fit_hierarchical", "prior_predictive"] as const;

// Create a fit job (status 'queued') and best-effort nudge the Modal worker. If the
// enqueue call fails or isn't configured, the worker's poll_queue fallback picks it up.
async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.project_id || !body?.config) {
    return NextResponse.json({ error: "project_id en config zijn verplicht" }, { status: 400 });
  }
  const type = body.type ?? "fit";
  if (!(ALLOWED_FIT_JOB_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: `onbekend jobtype: ${type}` }, { status: 400 });
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

  const { data, error } = await supabase
    .schema("mmm")
    .from("jobs")
    .insert({ project_id: body.project_id, type, dataset_id: body.dataset_id ?? null, config: body.config, created_by: viewer.id })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await nudgeModalEnqueue(data.id);
  return NextResponse.json({ job_id: data.id });
}

export const POST = withJsonErrors(handlePost);
