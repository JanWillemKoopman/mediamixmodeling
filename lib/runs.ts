// Een afstemming vastleggen en een berekening starten.
//
// Dezelfde reden als lib/datasets.ts: zowel /api/model-configurations en /api/runs als de
// flow-route moeten dit kunnen, en twee implementaties van "start een berekening" zouden uit
// elkaar gaan lopen. De regels staan hier één keer.

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_CONCURRENT_FITS, hasFitCapacity, nudgeWorker } from "@/lib/jobs";
import { validateIntent } from "@/lib/modelIntent";
import type { ModelIntent } from "@/lib/types";

/**
 * De rekeninstellingen zijn die van het product, niet van de gebruiker en al helemaal niet
 * van de AI: onder deze waarden betekent de diagnostiek niets meer, en er is geen situatie
 * waarin een marketeer erbij wint ze lager te zetten. Ze worden bij de run vastgelegd, zodat
 * hij reproduceerbaar blijft.
 */
export const SAMPLE = { draws: 1000, tune: 1000, chains: 4, target_accept: 0.95 };

export interface ConfigurationResult {
  configurationId: string | null;
  error: string | null;
  /** Alle gevonden problemen, zodat de gebruiker ze in één keer kan oplossen. */
  problems?: string[];
  status: number;
}

/**
 * Leg vast wat de gebruiker bedoelde. Niets meer.
 *
 * De priors worden hier NIET berekend. Dat vraagt gemeten eigenschappen van de dataset —
 * de schaal van de KPI, de typische weekdruk per kanaal, de seizoensuitslag die er werkelijk
 * in zit — dus dat gebeurt in de worker, in de ene Python-module die die logica bezit. Een
 * TypeScript-herimplementatie zou een tweede bron van waarheid zijn voor de
 * consequentieelste getallen in het product.
 */
export async function createConfiguration(
  supabase: SupabaseClient,
  projectId: string,
  datasetVersionId: string,
  intent: ModelIntent,
  userId: string,
): Promise<ConfigurationResult> {
  const fail = (error: string, status: number, problems?: string[]): ConfigurationResult => ({
    configurationId: null,
    error,
    problems,
    status,
  });

  const { data: dataset } = await supabase
    .schema("mmm")
    .from("dataset_versions")
    .select("id, project_id, status, approved_at, column_roles")
    .eq("id", datasetVersionId)
    .maybeSingle();
  if (!dataset || dataset.project_id !== projectId) return fail("Dataset niet gevonden.", 404);
  if (!dataset.approved_at) {
    return fail("Keur je data eerst goed voordat je het model afstemt.", 409);
  }

  // Wat hier wél wordt gecontroleerd: of de afstemming sámenhangt met de dataset — gesloten
  // woordenschat, en elke genoemde kolom aanwezig met de rol die de afstemming aanneemt.
  // Dat zijn fouten die een gebruiker in seconden herstelt, en ze hier vinden in plaats van
  // twee minuten in een berekening is het hele verschil.
  const problems = validateIntent(intent, dataset.column_roles ?? {});
  if (problems.length > 0) return fail(problems[0], 400, problems);

  const { data: configuration, error } = await supabase
    .schema("mmm")
    .from("model_configurations")
    .insert({ project_id: projectId, dataset_version_id: datasetVersionId, intent, created_by: userId })
    .select("id")
    .single();
  if (error) return fail(error.message, 400);

  return { configurationId: configuration.id, error: null, status: 200 };
}

export interface RunStartResult {
  runId: string | null;
  /** Waar: deze berekening bestond al — zelfde afstemming, zelfde data, zelfde seed. */
  reused: boolean;
  error: string | null;
  status: number;
}

/**
 * Start een berekening.
 *
 * De run zegt welke configuratie en welke datasetversie — niets anders. Er is geen
 * opslagpad mee te geven, geen prior, geen rekenknop: de worker lost dat allemaal zelf op.
 *
 * De idempotency-sleutel is dezelfde specificatie + dezelfde data + dezelfde seed. Een
 * dubbele klik of een herhaalde aanvraag levert dus de BESTAANDE run op in plaats van een
 * tweede identieke berekening van vijf minuten.
 */
export async function startModelRun(
  supabase: SupabaseClient,
  projectId: string,
  configurationId: string,
  userId: string,
  seed = 0,
): Promise<RunStartResult> {
  const fail = (error: string, status: number): RunStartResult => ({
    runId: null,
    reused: false,
    error,
    status,
  });

  const { data: configuration } = await supabase
    .schema("mmm")
    .from("model_configurations")
    .select("id, project_id, dataset_version_id, intent, spec_sha256")
    .eq("id", configurationId)
    .maybeSingle();
  if (!configuration || configuration.project_id !== projectId) {
    return fail("Modelconfiguratie niet gevonden.", 404);
  }

  const { data: dataset } = await supabase
    .schema("mmm")
    .from("dataset_versions")
    .select("id, status, approved_at, master_sha256")
    .eq("id", configuration.dataset_version_id)
    .maybeSingle();
  if (!dataset || dataset.status !== "ready") {
    return fail("Je data is nog niet klaar; wacht tot het klaarmaken af is.", 409);
  }
  if (!dataset.approved_at) return fail("Keur je data eerst goed voordat je gaat rekenen.", 409);

  if (!(await hasFitCapacity(supabase, projectId))) {
    return fail(
      `Er lopen al ${MAX_CONCURRENT_FITS} berekeningen voor dit project. Wacht tot er één klaar is.`,
      409,
    );
  }

  // Vóórdat de specificatie is opgelost bestaat er nog geen spec-hash, dus staat de intentie
  // ervoor in: zelfde intentie, zelfde data, zelfde seed is hoe dan ook dezelfde run.
  const identity = JSON.stringify({
    spec: configuration.spec_sha256 ?? configuration.intent,
    data: dataset.master_sha256,
    sample: SAMPLE,
    seed,
  });
  const idempotencyKey = createHash("sha256").update(identity).digest("hex");

  const { data: existing } = await supabase
    .schema("mmm")
    .from("model_runs")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    // Geen fout: de aanroeper vroeg precies om deze run, en die is er al.
    return { runId: existing.id as string, reused: true, error: null, status: 200 };
  }

  const { data: run, error } = await supabase
    .schema("mmm")
    .from("model_runs")
    .insert({
      project_id: projectId,
      model_configuration_id: configurationId,
      dataset_version_id: configuration.dataset_version_id,
      idempotency_key: idempotencyKey,
      seed,
      sample_params: SAMPLE,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    // Een unieke-sleutelconflict betekent dat een andere aanvraag de race won met dezelfde
    // sleutel; geef die run terug in plaats van een fout waar de gebruiker niets mee kan.
    const { data: raced } = await supabase
      .schema("mmm")
      .from("model_runs")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (raced) return { runId: raced.id as string, reused: true, error: null, status: 200 };
    return fail(error.message, 400);
  }

  await nudgeWorker("fit", run.id);
  return { runId: run.id as string, reused: false, error: null, status: 200 };
}
