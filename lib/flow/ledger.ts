// Het stappen-grootboek lezen (mmm.project_steps).
//
// Alleen lezen, server-side. Schrijven gebeurt straks op één plek — de flow-route die een
// stap afrondt — zodat er geen tweede pad ontstaat waarlangs een beslissing kan worden
// vastgelegd zonder dat het transcript het weet.

import { createClient } from "@/lib/supabase/server";
import { STEP_ORDER, type Ledger, type StepDecision, type StepId } from "@/lib/flow/steps";

const KNOWN_STEPS = new Set<string>(STEP_ORDER);

/**
 * De beslissingen van één project, op stap-id.
 *
 * Onbekende stap-ids worden genegeerd: de TypeScript-kant is de autoriteit over welke
 * stappen bestaan (zie de toelichting in 0024_flow_ledger.sql). Zo blijft een stap
 * hernoemen of verwijderen een applicatiewijziging in plaats van een migratie, en levert
 * een oude rij hooguit een genegeerde regel op — nooit een kapotte balk.
 */
export async function loadLedger(projectId: string): Promise<Ledger> {
  const supabase = createClient();
  const { data } = await supabase
    .schema("mmm")
    .from("project_steps")
    .select("step, decision, summary, decided_at, decided_by")
    .eq("project_id", projectId);

  const ledger: Ledger = {};
  for (const row of data ?? []) {
    const step = row.step as string;
    if (!KNOWN_STEPS.has(step)) continue;
    ledger[step as StepId] = {
      step: step as StepId,
      decision: (row.decision as Record<string, unknown>) ?? {},
      summary: (row.summary as string | null) ?? null,
      decided_at: row.decided_at as string,
      decided_by: (row.decided_by as string | null) ?? null,
    } satisfies StepDecision;
  }
  return ledger;
}

/**
 * Een beslissing vastleggen.
 *
 * Eén rij per (project, stap): opnieuw beslissen overschrijft en schuift `decided_at` naar
 * voren, waarmee alles wat ervan afhangt vanzelf als achterhaald zichtbaar wordt (zie
 * lib/flow/state.ts). Bewust alleen aangeroepen vanuit app/api/flow/route.ts, zodat er geen
 * tweede pad ontstaat waarlangs iets kan worden vastgelegd zonder dat het transcript het weet.
 */
export async function recordStepDecision(
  projectId: string,
  step: StepId,
  decision: Record<string, unknown>,
  summary: string,
  userId: string,
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("mmm")
    .from("project_steps")
    .upsert(
      {
        project_id: projectId,
        step,
        decision,
        summary,
        decided_at: new Date().toISOString(),
        decided_by: userId,
      },
      { onConflict: "project_id,step" },
    );
  return { error: error?.message ?? null };
}

/** Een beslissing terugnemen — de stap staat daarna weer open. */
export async function clearStepDecision(projectId: string, step: StepId): Promise<void> {
  const supabase = createClient();
  await supabase.schema("mmm").from("project_steps").delete().eq("project_id", projectId).eq("step", step);
}
