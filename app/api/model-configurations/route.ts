import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { withJsonErrors } from "@/lib/apiRoute";
import { validateIntent } from "@/lib/modelIntent";
import type { ModelIntent } from "@/lib/types";

// Store what the user (or the AI) meant. Nothing more.
//
// The priors are NOT computed here. Deriving them needs measured statistics of the actual
// dataset — the scale of the KPI, each channel's typical weekly pressure, the seasonal
// amplitude actually present — so it happens in the worker, in the one Python module that
// owns that logic. A TypeScript reimplementation would be a second source of truth for the
// most consequential numbers in the product, and the two would drift.
//
// What this route does check is that the intent is *coherent*: closed vocabulary only, every
// named column present in the approved dataset with the role the intent assumes. Those are
// mistakes a user can fix in seconds, and finding them here rather than two minutes into a
// run is the whole difference.
async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const projectId: string | undefined = body?.project_id;
  const datasetVersionId: string | undefined = body?.dataset_version_id;
  const intent = body?.intent as ModelIntent | undefined;
  if (!projectId || !datasetVersionId || !intent) {
    return NextResponse.json(
      { error: "project_id, dataset_version_id en intent zijn verplicht" },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const { data: dataset } = await supabase
    .schema("mmm")
    .from("dataset_versions")
    .select("id, project_id, status, approved_at, column_roles")
    .eq("id", datasetVersionId)
    .maybeSingle();

  if (!dataset || dataset.project_id !== projectId) {
    return NextResponse.json({ error: "dataset niet gevonden" }, { status: 404 });
  }
  if (!dataset.approved_at) {
    return NextResponse.json(
      { error: "keur de dataset eerst goed voordat je het model afstemt" },
      { status: 409 },
    );
  }

  const problems = validateIntent(intent, dataset.column_roles ?? {});
  if (problems.length > 0) {
    return NextResponse.json({ error: problems[0], problems }, { status: 400 });
  }

  const { data: configuration, error } = await supabase
    .schema("mmm")
    .from("model_configurations")
    .insert({
      project_id: projectId,
      dataset_version_id: datasetVersionId,
      intent,
      created_by: viewer.id,
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ model_configuration_id: configuration.id });
}

export const POST = withJsonErrors(handlePost);
