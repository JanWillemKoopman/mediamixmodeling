import { createClient } from "@/lib/supabase/server";
import type {
  DataInspection,
  DatasetVersion,
  ModelConfiguration,
  ModelResult,
  ModelRun,
  ModelValidation,
  Project,
  ProjectContext,
  ProjectSnapshot,
  RunView,
  SourceFile,
} from "@/lib/types";

/**
 * Assemble everything a project's wizard needs, in one place.
 *
 * A run, its result and its verdict live in three tables — deliberately, because a run can
 * finish without a usable result and a verdict carries its own ruleset version. Joining
 * them here rather than at each call site means no component can end up holding a summary
 * without the verdict that says what may be done with it, which is exactly how v1 came to
 * show budget advice for a model that had failed its own quality gate.
 */
export async function loadProjectSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
  const supabase = createClient();

  const { data: project } = await supabase
    .schema("mmm")
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;

  const [{ data: sources }, { data: datasets }, { data: runs }, { data: context }, { data: inspections }] =
    await Promise.all([
      supabase.schema("mmm").from("source_files").select("*").eq("project_id", projectId).order("created_at"),
      supabase
        .schema("mmm")
        .from("dataset_versions")
        .select("*")
        .eq("project_id", projectId)
        .order("version_no", { ascending: false }),
      supabase
        .schema("mmm")
        .from("model_runs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.schema("mmm").from("project_context").select("*").eq("project_id", projectId).maybeSingle(),
      supabase
        .schema("mmm")
        .from("data_inspections")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

  const runList = (runs ?? []) as unknown as ModelRun[];
  const runIds = runList.map((r) => r.id);

  // `summary` carries the per-week decomposition and can be large, and `analysis` holds
  // base64 chart images. Only the newest run needs the heavy fields; the rest are here for
  // the history list, which needs a handful of numbers.
  const [{ data: results }, { data: validations }] = runIds.length
    ? await Promise.all([
        supabase.schema("mmm").from("model_results").select("*").in("model_run_id", runIds),
        supabase.schema("mmm").from("model_validations").select("*").in("model_run_id", runIds),
      ])
    : [{ data: [] }, { data: [] }];

  const resultByRun = new Map((results ?? []).map((r) => [r.model_run_id as string, r as unknown as ModelResult]));
  const validationByRun = new Map(
    (validations ?? []).map((v) => [v.model_run_id as string, v as unknown as ModelValidation]),
  );
  const runViews: RunView[] = runList.map((run) => ({
    run,
    result: resultByRun.get(run.id) ?? null,
    validation: validationByRun.get(run.id) ?? null,
  }));

  const datasetList = (datasets ?? []) as unknown as DatasetVersion[];
  const approvedDataset = datasetList.find((d) => d.approved_at) ?? null;

  // The configuration behind the newest run, so the wizard can show what was asked for.
  let configuration: ModelConfiguration | null = null;
  if (runViews[0]) {
    const { data } = await supabase
      .schema("mmm")
      .from("model_configurations")
      .select("*")
      .eq("id", runViews[0].run.model_configuration_id)
      .maybeSingle();
    configuration = (data as unknown as ModelConfiguration) ?? null;
  }

  return {
    project: project as unknown as Project,
    sources: (sources ?? []) as unknown as SourceFile[],
    dataset: datasetList[0] ?? null,
    approvedDataset,
    configuration,
    runs: runViews,
    context: (context as unknown as ProjectContext) ?? null,
    inspection: ((inspections ?? []) as unknown as DataInspection[])[0] ?? null,
  };
}
