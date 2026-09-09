import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_CONCURRENT_FITS, hasFitCapacity, nudgeWorker } from "@/lib/jobs";
import { withJsonErrors } from "@/lib/apiRoute";

// Sampling settings are the product's, not the user's and certainly not the AI's: below
// these the diagnostics stop meaning anything, and there is no situation where a marketer
// benefits from turning them down. They are recorded on the run so it stays reproducible.
const SAMPLE = { draws: 1000, tune: 1000, chains: 4, target_accept: 0.95 };

/**
 * Start a model run.
 *
 * The run says which configuration and which dataset version — nothing else. There is no
 * storage path to supply, no priors to pass, no sampler knobs: the worker resolves all of
 * it. That is what closes the v1 hole where a client-supplied `storage_path` was downloaded
 * with the service-role key, which bypasses row-level security entirely.
 *
 * The idempotency key is the same specification + the same data + the same seed. A double
 * click, a retried request or a duplicate spawn therefore returns the *existing* run rather
 * than starting a second identical five-minute fit.
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

  const supabase = createClient();
  const { data: configuration } = await supabase
    .schema("mmm")
    .from("model_configurations")
    .select("id, project_id, dataset_version_id, intent, spec_sha256")
    .eq("id", configurationId)
    .maybeSingle();
  if (!configuration || configuration.project_id !== projectId) {
    return NextResponse.json({ error: "modelconfiguratie niet gevonden" }, { status: 404 });
  }

  const { data: dataset } = await supabase
    .schema("mmm")
    .from("dataset_versions")
    .select("id, status, approved_at, master_sha256")
    .eq("id", configuration.dataset_version_id)
    .maybeSingle();
  if (!dataset || dataset.status !== "ready") {
    return NextResponse.json(
      { error: "de dataset is nog niet klaar; wacht tot de voorbereiding is afgerond" },
      { status: 409 },
    );
  }
  if (!dataset.approved_at) {
    return NextResponse.json(
      { error: "keur de dataset eerst goed voordat je gaat rekenen" },
      { status: 409 },
    );
  }

  if (!(await hasFitCapacity(supabase, projectId))) {
    return NextResponse.json(
      {
        error: `Er lopen al ${MAX_CONCURRENT_FITS} berekeningen voor dit project. Wacht tot er één klaar is.`,
      },
      { status: 409 },
    );
  }

  // Before the specification is resolved there is no spec hash yet, so the intent stands in
  // for it — same intent, same data, same seed is the same run either way.
  const identity = JSON.stringify({
    spec: configuration.spec_sha256 ?? configuration.intent,
    data: dataset.master_sha256,
    sample: SAMPLE,
    seed,
  });
  const idempotencyKey = createHash("sha256").update(identity).digest("hex");

  const { data: existing } = await supabase
    .schema("mmm")
    .from("model_runs")
    .select("id, state")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    // Not an error: the caller asked for exactly this run and it already exists.
    return NextResponse.json({ model_run_id: existing.id, state: existing.state, reused: true });
  }

  const { data: run, error } = await supabase
    .schema("mmm")
    .from("model_runs")
    .insert({
      project_id: projectId,
      model_configuration_id: configurationId,
      dataset_version_id: configuration.dataset_version_id,
      idempotency_key: idempotencyKey,
      seed,
      sample_params: SAMPLE,
      created_by: viewer.id,
    })
    .select("id, state")
    .single();
  if (error) {
    // A unique-violation here means another request won the race with the same key; return
    // that run rather than an error the user cannot act on.
    const { data: raced } = await supabase
      .schema("mmm")
      .from("model_runs")
      .select("id, state")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (raced) {
      return NextResponse.json({ model_run_id: raced.id, state: raced.state, reused: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await nudgeWorker("fit", run.id);
  return NextResponse.json({ model_run_id: run.id, state: run.state, reused: false });
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
