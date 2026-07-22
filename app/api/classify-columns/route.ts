import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildClassifyRequest, parseColumnMapping } from "@/lib/anthropic/columnMapping";
import type { SourceProfile } from "@/lib/types";
import { withJsonErrors, claudeErrorMessage } from "@/lib/apiRoute";

// Cheap, one-shot column-semantics classification for a single uploaded source file. Called
// fire-and-forget from SourceUpload.tsx right after a CSV is inserted; the result is cached
// on source_files.mapping and read back by the chat architect. Kept a small Haiku call so it
// costs almost nothing and can run on every upload.
async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const sourceFileId: string | undefined = body?.source_file_id;
  if (!sourceFileId) {
    return NextResponse.json({ error: "source_file_id is verplicht" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY niet geconfigureerd." }, { status: 503 });
  }

  const supabase = createClient();
  const { data: file } = await supabase
    .schema("mmm")
    .from("source_files")
    .select("id, name, preview, profile")
    .eq("id", sourceFileId)
    .maybeSingle();

  if (!file?.preview) {
    // Nothing textual to classify (binary/xlsx, or preview missing) — not an error.
    return NextResponse.json({ mapping: null });
  }

  const client = new Anthropic({ apiKey });
  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      buildClassifyRequest(file.name as string, file.preview as string, (file.profile as SourceProfile | null) ?? null),
    );
  } catch (err) {
    return NextResponse.json({ error: claudeErrorMessage(err) }, { status: 502 });
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "classify_columns",
  );
  const mapping = toolUse ? parseColumnMapping(toolUse.input) : null;
  if (!mapping) {
    return NextResponse.json({ mapping: null });
  }

  const { error: updateErr } = await supabase
    .schema("mmm")
    .from("source_files")
    .update({ mapping })
    .eq("id", sourceFileId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  return NextResponse.json({ mapping });
}

export const POST = withJsonErrors(handlePost);
