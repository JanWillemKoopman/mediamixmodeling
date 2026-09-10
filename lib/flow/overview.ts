// Waar staat elk project? Voor de projectenlijst.
//
// De lijst had zijn eigen afleiding, met eigen drempels en eigen stapnummers. Die liep uit de
// pas met de wizard, en na migratie 0022 zelfs met de database: hij bevroeg `mmm.datasets` en
// `mmm.jobs`, tabellen die toen zijn gedropt. Het resultaat was een voortgangsregel die altijd
// "Stap 1 van 7 · data uploaden" zei, voor elk project, zonder dat iets een fout gaf.
//
// Daarom staat hier geen tweede afleiding meer. Wat hier gebeurt is: per project precies die
// velden ophalen die `deriveFlowState` leest, en dan diezelfde functie aanroepen. De lijst en
// het traject kunnen dus niet meer iets anders beweren.

import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveFlowState } from "@/lib/flow/state";
import { STEP_ORDER, type Ledger, type StepId } from "@/lib/flow/steps";
import type { ProjectSnapshot } from "@/lib/types";

export interface ProjectProgress {
  stepNumber: number;
  totalSteps: number;
  label: string;
  /** Waar: er loopt iets op de achtergrond (samenvoegen of rekenen). */
  busy: boolean;
}

/**
 * Bouw het stukje snapshot dat de afleiding daadwerkelijk leest.
 *
 * De cast is bewust en beperkt tot deze ene plek: `deriveFlowState` raakt van een bron alleen
 * `inspection_confirmed_at` en `created_at` aan, van een run zijn toestand en tijden, en van
 * een resultaat of oordeel alleen of er gepubliceerd mag worden. Alles volledig ophalen zou
 * voor een lijst van dertig projecten de zware velden (weekdecompositie, grafiek-afbeeldingen)
 * meetrekken.
 */
function partialSnapshot(parts: {
  source: { inspection_confirmed_at: string | null; created_at: string } | null;
  dataset: { status: string; approved_at: string | null; created_at: string } | null;
  runs: {
    state: string;
    created_at: string;
    finished_at: string | null;
    error_code: string | null;
    is_published: boolean;
    published_at: string | null;
    allowed_outputs: string[];
  }[];
}): ProjectSnapshot {
  const dataset = parts.dataset as ProjectSnapshot["dataset"];
  return {
    project: {} as ProjectSnapshot["project"],
    sources: parts.source ? [parts.source as unknown as ProjectSnapshot["sources"][number]] : [],
    dataset,
    approvedDataset: parts.dataset?.approved_at ? dataset : null,
    configuration: null,
    runs: parts.runs.map((r) => ({
      run: {
        state: r.state,
        created_at: r.created_at,
        finished_at: r.finished_at,
        error_code: r.error_code,
      },
      result: { is_published: r.is_published, published_at: r.published_at },
      validation: { allowed_outputs: r.allowed_outputs },
    })) as unknown as ProjectSnapshot["runs"],
    context: null,
    inspection: null,
  };
}

/** De voortgang van alle projecten in één keer. */
export async function loadProgress(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<Map<string, ProjectProgress>> {
  const out = new Map<string, ProjectProgress>();
  if (projectIds.length === 0) return out;

  const [{ data: sources }, { data: datasets }, { data: runs }, { data: steps }] = await Promise.all([
    supabase
      .schema("mmm")
      .from("source_files")
      .select("project_id, inspection_confirmed_at, created_at")
      .in("project_id", projectIds)
      .order("created_at"),
    supabase
      .schema("mmm")
      .from("dataset_versions")
      .select("project_id, status, approved_at, created_at, version_no")
      .in("project_id", projectIds)
      .order("version_no", { ascending: false }),
    supabase
      .schema("mmm")
      .from("model_runs")
      .select("id, project_id, state, created_at, finished_at, error_code")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false }),
    supabase
      .schema("mmm")
      .from("project_steps")
      .select("project_id, step, decision, summary, decided_at")
      .in("project_id", projectIds),
  ]);

  const runIds = (runs ?? []).map((r) => r.id as string);
  const [{ data: results }, { data: validations }] = runIds.length
    ? await Promise.all([
        supabase
          .schema("mmm")
          .from("model_results")
          .select("model_run_id, is_published, published_at")
          .in("model_run_id", runIds),
        supabase
          .schema("mmm")
          .from("model_validations")
          .select("model_run_id, allowed_outputs")
          .in("model_run_id", runIds),
      ])
    : [{ data: [] }, { data: [] }];

  const resultByRun = new Map(
    (results ?? []).map((r) => [r.model_run_id as string, r as { is_published: boolean; published_at: string | null }]),
  );
  const allowedByRun = new Map(
    (validations ?? []).map((v) => [v.model_run_id as string, (v.allowed_outputs as string[]) ?? []]),
  );

  const firstSource = new Map<string, { inspection_confirmed_at: string | null; created_at: string }>();
  for (const row of sources ?? []) {
    const id = row.project_id as string;
    if (!firstSource.has(id)) {
      firstSource.set(id, {
        inspection_confirmed_at: (row.inspection_confirmed_at as string | null) ?? null,
        created_at: row.created_at as string,
      });
    }
  }

  const newestDataset = new Map<string, { status: string; approved_at: string | null; created_at: string }>();
  const approvedDataset = new Map<string, { status: string; approved_at: string | null; created_at: string }>();
  for (const row of datasets ?? []) {
    const id = row.project_id as string;
    const entry = {
      status: row.status as string,
      approved_at: (row.approved_at as string | null) ?? null,
      created_at: row.created_at as string,
    };
    if (!newestDataset.has(id)) newestDataset.set(id, entry);
    if (entry.approved_at && !approvedDataset.has(id)) approvedDataset.set(id, entry);
  }

  const runsByProject = new Map<string, ReturnType<typeof toRun>[]>();
  function toRun(row: Record<string, unknown>) {
    const runId = row.id as string;
    const result = resultByRun.get(runId);
    return {
      state: row.state as string,
      created_at: row.created_at as string,
      finished_at: (row.finished_at as string | null) ?? null,
      error_code: (row.error_code as string | null) ?? null,
      is_published: result?.is_published ?? false,
      published_at: result?.published_at ?? null,
      allowed_outputs: allowedByRun.get(runId) ?? [],
    };
  }
  for (const row of runs ?? []) {
    const id = row.project_id as string;
    const list = runsByProject.get(id) ?? [];
    list.push(toRun(row));
    runsByProject.set(id, list);
  }

  const ledgerByProject = new Map<string, Ledger>();
  for (const row of steps ?? []) {
    const id = row.project_id as string;
    const step = row.step as string;
    if (!STEP_ORDER.includes(step as StepId)) continue;
    const ledger = ledgerByProject.get(id) ?? {};
    ledger[step as StepId] = {
      step: step as StepId,
      decision: (row.decision as Record<string, unknown>) ?? {},
      summary: (row.summary as string | null) ?? null,
      decided_at: row.decided_at as string,
      decided_by: null,
    };
    ledgerByProject.set(id, ledger);
  }

  for (const projectId of projectIds) {
    // Een goedgekeurde versie is niet altijd de nieuwste: wie opnieuw klaarmaakt heeft een
    // nieuwe 'queued' versie én een oudere goedgekeurde. De afleiding leest ze apart.
    const snapshot = partialSnapshot({
      source: firstSource.get(projectId) ?? null,
      dataset: newestDataset.get(projectId) ?? null,
      runs: runsByProject.get(projectId) ?? [],
    });
    const approved = approvedDataset.get(projectId);
    if (approved) {
      snapshot.approvedDataset = approved as unknown as ProjectSnapshot["approvedDataset"];
    }

    const state = deriveFlowState(snapshot, ledgerByProject.get(projectId) ?? {});
    const step = state.steps.find((s) => s.id === state.activeStepId)!;
    out.set(projectId, {
      stepNumber: step.number,
      totalSteps: STEP_ORDER.length,
      label: step.waiting ? step.waiting.stage : step.label,
      busy: step.status === "waiting",
    });
  }

  return out;
}
