// Een datasetversie aanmaken en goedkeuren.
//
// Deze logica woonde in de routes zelf (app/api/datasets/…). Nu de flow-route hetzelfde moet
// kunnen, staat hij hier: één implementatie voor beide aanroepers. De alternatieve route —
// de client eerst /api/datasets laten aanroepen en daarna /api/flow — zou de beslissing en
// het gevolg uit elkaar trekken, en dan kan het één slagen terwijl het ander mislukt.

import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_CONCURRENT_DATASET_BUILDS, hasDatasetCapacity, nudgeWorker } from "@/lib/jobs";
import type { ChannelUnit, DatasetRecipe } from "@/lib/types";

export interface DatasetCreateResult {
  datasetVersionId: string | null;
  versionNo: number | null;
  /** Mensentaal, direct toonbaar. */
  error: string | null;
  status: number;
}

/**
 * Maak een nieuwe datasetversie uit een recept en zet de worker aan het werk.
 *
 * Het recept noemt bestanden bij hun rij-id, nooit bij een opslagpad; de controle hieronder
 * bevestigt dat elk genoemd bestand ook echt bij dit project hoort. De worker controleert dat
 * nog een keer — dat is de grens die telt — maar hier krijgt de gebruiker meteen een
 * begrijpelijk antwoord in plaats van een mislukte bouw twee minuten later.
 */
export async function createDatasetVersion(
  supabase: SupabaseClient,
  projectId: string,
  recipe: DatasetRecipe,
  userId: string,
  /**
   * Waarin elk kanaal meet. Wordt bij de versie bewaard omdat de rest van de app erop
   * afgaat: alleen een kanaal in euro's krijgt een rendement per euro en doet mee in de
   * budgetverdeling. Bleef dit leeg, dan viel élk kanaal terug op "currency" — en dan telt
   * een kolom met e-mailverzendingen mee als bedrag en krijgt hij een ROAS.
   */
  columnUnits?: Record<string, ChannelUnit> | null,
): Promise<DatasetCreateResult> {
  const fail = (error: string, status: number): DatasetCreateResult => ({
    datasetVersionId: null,
    versionNo: null,
    error,
    status,
  });

  if (!recipe?.sources?.length) {
    return fail("Een recept heeft minimaal één bron nodig.", 400);
  }

  const sourceIds = recipe.sources.map((s) => s.source_file_id).filter(Boolean);
  if (sourceIds.length !== recipe.sources.length) {
    return fail("Elke bron in het recept moet een source_file_id hebben.", 400);
  }

  const { data: owned } = await supabase
    .schema("mmm")
    .from("source_files")
    .select("id")
    .eq("project_id", projectId)
    .in("id", sourceIds);
  if ((owned ?? []).length !== sourceIds.length) {
    return fail("Het recept verwijst naar een bestand dat niet bij dit project hoort.", 400);
  }

  if (!(await hasDatasetCapacity(supabase, projectId))) {
    return fail(
      `Er lopen al ${MAX_CONCURRENT_DATASET_BUILDS} voorbereidingen voor dit project. Wacht tot er één klaar is.`,
      409,
    );
  }

  const { data: versionNo, error: versionErr } = await supabase
    .schema("mmm")
    .rpc("next_dataset_version_no", { p_project_id: projectId });
  if (versionErr) return fail(versionErr.message, 400);

  const { data: dataset, error } = await supabase
    .schema("mmm")
    .from("dataset_versions")
    .insert({
      project_id: projectId,
      version_no: versionNo,
      source_file_ids: sourceIds,
      recipe,
      status: "queued",
      created_by: userId,
      ...(columnUnits && Object.keys(columnUnits).length > 0 ? { column_units: columnUnits } : {}),
    })
    .select("id, version_no")
    .single();
  if (error) return fail(error.message, 400);

  await nudgeWorker("dataset", dataset.id);
  return { datasetVersionId: dataset.id, versionNo: dataset.version_no, error: null, status: 200 };
}

/**
 * Keur een gebouwde datasetversie goed: hierna mag erop gerekend worden.
 *
 * Er kan er maar één tegelijk goedgekeurd zijn (een partiële unieke index dwingt dat af), en
 * dát is wat "op welke data is dit resultaat gebaseerd" beantwoordbaar maakt. Een nieuwe
 * goedkeuring vervangt daarom eerst de vorige, anders zou de update afketsen en bleef de
 * gebruiker aan een oudere dataset vastzitten.
 */
export async function approveDatasetVersion(
  supabase: SupabaseClient,
  datasetId: string,
  userId: string,
): Promise<{ error: string | null; status: number }> {
  const { data: dataset } = await supabase
    .schema("mmm")
    .from("dataset_versions")
    .select("id, project_id, status, verdict")
    .eq("id", datasetId)
    .maybeSingle();
  if (!dataset) return { error: "Dataset niet gevonden.", status: 404 };

  if (dataset.status !== "ready") {
    return {
      error:
        dataset.status === "failed"
          ? "Het klaarmaken is mislukt. Los eerst op wat er in het rapport staat."
          : "Het klaarmaken loopt nog. Wacht tot dat klaar is.",
      status: 409,
    };
  }
  if (dataset.verdict === "not_usable") {
    return {
      error:
        "Op deze data kan geen model gebouwd worden. Los eerst de blokkerende punten uit het rapport op.",
      status: 409,
    };
  }

  await supabase
    .schema("mmm")
    .from("dataset_versions")
    .update({ approved_at: null, approved_by: null })
    .eq("project_id", dataset.project_id)
    .not("approved_at", "is", null)
    .neq("id", datasetId);

  const { error } = await supabase
    .schema("mmm")
    .from("dataset_versions")
    .update({ approved_at: new Date().toISOString(), approved_by: userId })
    .eq("id", datasetId);
  if (error) return { error: error.message, status: 400 };
  return { error: null, status: 200 };
}
