import { createClient } from "@/lib/supabase/server";

// How much work may be in flight at once, per kind. Two separate pools because the work is
// nothing alike: a dataset build takes seconds and one core, a fit takes minutes and four.
// v1 shared one pool, so a crashed five-second build held a fit slot for thirty-five minutes.
export const MAX_CONCURRENT_FITS = 2;
export const MAX_CONCURRENT_DATASET_BUILDS = 4;

// A row whose container died without reaching a terminal state is reaped by the worker's
// poller after roughly this long. The capacity check ignores anything older, so a dead
// container can never freeze the queue permanently.
const STALE_MINUTES = 20;

function cutoff(): string {
  return new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
}

/** Fits currently queued or running for this project. */
export async function hasFitCapacity(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<boolean> {
  const { count } = await supabase
    .schema("mmm")
    .from("model_runs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .not("state", "in", "(completed,failed,cancelled)")
    .gte("created_at", cutoff());
  return (count ?? 0) < MAX_CONCURRENT_FITS;
}

export async function hasDatasetCapacity(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<boolean> {
  const { count } = await supabase
    .schema("mmm")
    .from("dataset_versions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .in("status", ["queued", "building"])
    .gte("created_at", cutoff());
  return (count ?? 0) < MAX_CONCURRENT_DATASET_BUILDS;
}

/**
 * Ask the worker to pick a row up now rather than waiting for its one-minute poll.
 *
 * Best-effort by design — the poll is the guarantee — but it has to actually work, and in
 * v1 it never did: the Modal endpoint declared `job_id: str`, which FastAPI reads as a
 * *query* parameter, while this function sent a JSON body. Every call returned 422, the
 * caller swallowed it, and every single job silently waited a full minute before starting.
 */
export async function nudgeWorker(kind: "fit" | "dataset", id: string): Promise<void> {
  const url = process.env.MMM_MODAL_ENQUEUE_URL;
  const token = process.env.MMM_ENQUEUE_TOKEN;
  if (!url || !token) return;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, token }),
    });
    if (!response.ok) {
      // Log it rather than swallowing: a permanently broken nudge is invisible otherwise,
      // and shows up only as "starting always takes a minute".
      console.error(`[jobs] enqueue nudge failed (${response.status}) for ${kind} ${id}`);
    }
  } catch (err) {
    console.error(`[jobs] enqueue nudge unreachable for ${kind} ${id}:`, err);
  }
}
