import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { withJsonErrors } from "@/lib/apiRoute";

/**
 * De afstemming achter één berekening teruglezen.
 *
 * Deze route ontbrak. `lib/wizard/turns/review.ts` riep hem al aan voor "gebruik de
 * afstemming van run N als startpunt", en kreeg dus altijd een 404 terug: de functie heeft
 * nooit gewerkt. Gevonden door de route-bestaan-test in lib/flow/__tests__/routes.test.ts,
 * die elke /api/…-aanroep in de broncode naast de routebestanden op schijf legt.
 *
 * Er gaat bewust alleen de INTENTIE over de lijn, niet de afgeleide specificatie. Die
 * laatste hoort bij de dataset waarop hij is afgeleid; hem hergebruiken op andere data zou
 * de afstemming aan de oude cijfers vastzetten. De priors worden per run opnieuw afgeleid.
 */
async function handleGet(_request: Request, { params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const supabase = createClient();
  const { data } = await supabase
    .schema("mmm")
    .from("model_configurations")
    .select("id, project_id, dataset_version_id, intent, created_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "modelconfiguratie niet gevonden" }, { status: 404 });
  }

  return NextResponse.json({
    model_configuration_id: data.id,
    project_id: data.project_id,
    dataset_version_id: data.dataset_version_id,
    intent: data.intent,
    created_at: data.created_at,
  });
}

export const GET = withJsonErrors(handleGet);
