import { createClient } from "@/lib/supabase/server";

// Must match `max_containers` on `run_fit` in worker/mmm_worker/modal_app.py. One
// Modal function (`run_fit`) dispatches BOTH job types ('fit' and 'prepare'), so they
// share one container pool — this check must count both, not just fits.
export const MAX_CONCURRENT_JOBS = 2;

// A job whose container died without reaching mark_failed (Modal timeout kill, OOM)
// stays 'running' in the database. The worker's poll_queue reaps those after this many
// minutes; the capacity check below ignores anything older so a dead job can never
// freeze the queue for good. Keep >= STALE_RUNNING_SECONDS in worker/mmm_worker/modal_app.py.
const STALE_JOB_MINUTES = 40;

// 'queued' counts too, not just 'running': a queued job is about to consume a slot
// (enqueue/poll_queue promotes it within seconds to a minute), so treating only
// 'running' as occupied would let a burst of requests slip through the gap.
export async function hasJobCapacity(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const cutoff = new Date(Date.now() - STALE_JOB_MINUTES * 60_000).toISOString();
  const { count } = await supabase
    .schema("mmm")
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "running"])
    .gte("created_at", cutoff);
  return (count ?? 0) < MAX_CONCURRENT_JOBS;
}

// Best-effort nudge so the Modal worker picks the job up immediately rather than waiting
// for the next poll_queue tick (runs every minute regardless, so this is never required).
export async function nudgeModalEnqueue(jobId: string): Promise<void> {
  const enqueueUrl = process.env.MMM_MODAL_ENQUEUE_URL;
  if (!enqueueUrl) return;
  try {
    await fetch(enqueueUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId }),
    });
  } catch {
    // Non-fatal: poll_queue on Modal will still pick up the queued job.
  }
}
