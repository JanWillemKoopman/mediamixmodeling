import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { approveDatasetVersion } from "@/lib/datasets";
import { withJsonErrors } from "@/lib/apiRoute";

// Approve a built dataset version: it becomes the definitive input for modelling.
// The rules live in lib/datasets.ts, shared with the flow route.
async function handlePost(_request: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const { error, status } = await approveDatasetVersion(createClient(), params.id, viewer.id);
  if (error) return NextResponse.json({ error }, { status });
  return NextResponse.json({ ok: true });
}

export const POST = withJsonErrors(handlePost);
