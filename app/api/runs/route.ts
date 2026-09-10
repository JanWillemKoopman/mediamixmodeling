import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { startModelRun } from "@/lib/runs";
import { withJsonErrors } from "@/lib/apiRoute";

/**
 * Start a model run.
 *
 * The run says which configuration and which dataset version — nothing else. There is no
 * storage path to supply, no priors to pass, no sampler knobs: the worker resolves all of
 * it. That is what closes the v1 hole where a client-supplied `storage_path` was downloaded
 * with the service-role key, which bypasses row-level security entirely.
 *
 * The work lives in lib/runs.ts, shared with the flow route (app/api/flow): idempotency,
 * capacity and the fixed sampling settings are rules of the product, not of a route.
 */
async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const projectId: string | undefined = body?.project_id;
  const configurationId: string | undefined = body?.model_configuration_id;
  const seed: number = Number.isInteger(body?.seed) ? body.seed : 0;
  if (!projectId || !configurationId) {
    return NextResponse.json(
      { error: "project_id en model_configuration_id zijn verplicht" },
      { status: 400 },
    );
  }

  const result = await startModelRun(createClient(), projectId, configurationId, viewer.id, seed);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ model_run_id: result.runId, reused: result.reused });
}

/** Ask a running model run to stop. The worker checks between steps. */
async function handleDelete(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }
  const runId = new URL(request.url).searchParams.get("model_run_id");
  if (!runId) {
    return NextResponse.json({ error: "model_run_id is verplicht" }, { status: 400 });
  }
  const supabase = createClient();
  const { error } = await supabase
    .schema("mmm")
    .from("model_runs")
    .update({ cancel_requested: true })
    .eq("id", runId)
    .not("state", "in", "(completed,failed,cancelled)");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export const POST = withJsonErrors(handlePost);
export const DELETE = withJsonErrors(handleDelete);
