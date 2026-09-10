// Het profiel van een al geüpload bestand bijwerken, in de browser.
//
// Het profiel draagt sinds kort de reeks zelf mee (lib/dataProfile.ts): de weekwaarden en de
// precieze plek van elk gat. Bestanden die daarvóór zijn geüpload hebben dat niet, en stap 4
// kan dan wel de vraag stellen maar niet laten zien waarop hij berust — precies het halve
// gezicht dat we juist repareren.
//
// De reparatie hoort niet in een migratie thuis: het profiel wordt uit het BESTAND afgeleid,
// niet uit de database. Daarom wordt het hier opnieuw gemaakt, langs precies dezelfde weg als
// bij de upload (downloaden, parsen, `buildSourceProfile`), en één keer weggeschreven. Daarna
// is het klaar; een volgend bezoek merkt er niets meer van.
//
// Wat het niet doet: iets anders aanraken dan het profiel. De kolomindeling, de bevestiging en
// alles wat de gebruiker heeft besloten blijven staan — het profiel is afgeleide informatie.

import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import { buildSourceProfile } from "@/lib/dataProfile";
import type { SourceFile } from "@/lib/types";

const BUCKET = "mmm-raw-data";

/** Mist dit profiel de reeks, terwijl het bestand hem wel zou kunnen opleveren? */
export function needsSeriesBackfill(source: SourceFile): boolean {
  return source.profile != null && source.profile.labels == null && /\.csv$/i.test(source.name);
}

/**
 * Bouw het profiel opnieuw uit het opgeslagen bestand.
 *
 * Geeft `true` als er iets is bijgewerkt. Mislukt het — bestand weg, te groot voor een reeks,
 * onleesbaar — dan gebeurt er niets en blijft stap 4 gewoon werken zonder grafiek. Dit is een
 * verbetering van het beeld, nooit een voorwaarde om verder te kunnen.
 */
export async function backfillProfileSeries(source: SourceFile): Promise<boolean> {
  if (!needsSeriesBackfill(source)) return false;
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(source.storage_path);
  if (error || !data) return false;

  let profile;
  try {
    const parsed = Papa.parse<Record<string, unknown>>(await data.text(), {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });
    const columns = parsed.meta.fields ?? [];
    if (columns.length === 0 || parsed.data.length === 0) return false;
    profile = buildSourceProfile(columns, parsed.data);
  } catch {
    return false;
  }
  // Geen reeks erin (het bestand is er te lang voor): dan levert opslaan niets op.
  if (profile.labels == null) return false;

  const { error: updateError } = await supabase
    .schema("mmm")
    .from("source_files")
    .update({ profile })
    .eq("id", source.id);
  return !updateError;
}
