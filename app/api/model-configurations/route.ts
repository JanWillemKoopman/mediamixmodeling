import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createConfiguration } from "@/lib/runs";
import { withJsonErrors } from "@/lib/apiRoute";
import type { ModelIntent } from "@/lib/types";

// Store what the user (or the AI) meant. Nothing more — the priors are derived in the
// worker, from measured statistics of the actual dataset.
//
// The rules live in lib/runs.ts, shared with the flow route (app/api/flow), so there is one
// implementation of "record an intent" rather than two that can drift.
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

  const result = await createConfiguration(
    createClient(),
    projectId,
    datasetVersionId,
    intent,
    viewer.id,
  );
  if (result.error) {
    return NextResponse.json(
      { error: result.error, ...(result.problems ? { problems: result.problems } : {}) },
      { status: result.status },
    );
  }
  return NextResponse.json({ model_configuration_id: result.configurationId });
}

export const POST = withJsonErrors(handlePost);
