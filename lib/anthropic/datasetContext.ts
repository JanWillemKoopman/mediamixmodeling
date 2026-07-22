import type { Dataset, DatasetQuality } from "@/lib/types";

// Mirrors fitContext.ts's approach, but for the data-PREPARATION stage: formats the
// latest dataset (or its absence) into compact Dutch text for the architect, and decides
// whether interpreting it needs the deeper (analyst) model.

export interface ArchitectDatasetContext {
  latestDataset: Dataset | null;
}

// There is something to *interpret* (a merge result or a failure) once a dataset has
// actually been prepared or has failed — proposing a first recipe from raw file previews
// is the bounded config-style task; reading a quality report is the deeper one.
export function datasetNeedsAnalysis(ctx: ArchitectDatasetContext): boolean {
  const status = ctx.latestDataset?.status;
  return status === "prepared" || status === "approved" || status === "failed";
}

function severityLabel(sev: string): string {
  if (sev === "error") return "FOUT";
  if (sev === "warning") return "waarschuwing";
  return "info";
}

function formatQuality(quality: DatasetQuality | null): string {
  if (!quality || quality.issues.length === 0) return "Geen bijzonderheden gevonden.";
  const bySeverity = { error: 0, warning: 0, info: 0 } as Record<string, number>;
  for (const i of quality.issues) bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
  const lines = [
    `${bySeverity.error ?? 0} fout(en), ${bySeverity.warning ?? 0} waarschuwing(en), ${bySeverity.info ?? 0} info-melding(en):`,
  ];
  for (const issue of quality.issues) {
    const src = issue.source ? ` [${issue.source}]` : "";
    lines.push(`  • (${severityLabel(issue.severity)}${src}) ${issue.message}`);
  }
  return lines.join("\n");
}

function formatPreview(ds: Dataset): string {
  if (!ds.preview) return "";
  const cols = ds.preview.columns.map((c) => `${c.name}(${c.role ?? "?"})`).join(", ");
  const lines = [`Kolommen: ${cols}`];
  for (const [name, s] of Object.entries(ds.preview.summary)) {
    if (s.role === "kpi" || s.role === "spend") {
      lines.push(
        `  • ${name}: gemiddeld ${s.mean?.toFixed(0) ?? "?"}, bereik ${s.min?.toFixed(0) ?? "?"}–${s.max?.toFixed(0) ?? "?"}, ${s.n_missing} ontbrekend`,
      );
    }
  }
  return lines.join("\n");
}

// Zakelijke notities die de bouwer per kolom heeft vastgelegd — de hoogste-kwaliteit
// context die er is (rechtstreeks van een mens over déze kolom), dus expliciet
// gemarkeerd zodat het model ze zwaar meeweegt bij channel_type/adstock/prior-keuzes.
function formatColumnNotes(ds: Dataset): string {
  const notes = Object.entries(ds.column_notes ?? {});
  if (notes.length === 0) return "";
  return [
    "Zakelijke notities van de bouwer per kolom (weeg deze zwaar mee in je voorstellen):",
    ...notes.map(([col, note]) => `  • ${col}: ${note}`),
  ].join("\n");
}

export function formatDatasetContextBlock(ctx: ArchitectDatasetContext): string {
  const ds = ctx.latestDataset;
  if (!ds) {
    return "Er is nog geen dataset-voorbereiding gestart voor dit project. Als er brondata is geüpload, stel dan een merge-recept voor met de tool 'propose_prepare_recipe'.";
  }

  if (ds.status === "draft") {
    return "Er ligt een concept-recept klaar maar de samenvoeging is nog niet gecontroleerd (nog niet gedraaid).";
  }
  if (ds.status === "preparing") {
    return "De samenvoeging draait nu — nog geen resultaat om te bespreken.";
  }
  if (ds.status === "failed") {
    return [
      `De laatste samenvoeging is MISLUKT.`,
      `Foutmelding: ${ds.error ?? "(geen melding opgeslagen)"}`,
      formatQuality(ds.quality),
      "Diagnosticeer de oorzaak (vaak: kolomrol verkeerd, geen overlappende periode tussen bronnen, of een control met gaten) en stel een aangepast recept voor met 'propose_prepare_recipe'.",
    ].join("\n");
  }

  // prepared or approved: something concrete to interpret.
  const statusLine =
    ds.status === "approved"
      ? "Deze dataset is GOEDGEKEURD en is het definitieve bestand waarop gemodelleerd wordt."
      : "Deze samenvoeging is klaar en wacht op beoordeling/goedkeuring door de bouwer.";
  return [
    statusLine,
    `Periode: ${ds.window_start} t/m ${ds.window_end} (${ds.n_weeks} weken).`,
    formatPreview(ds),
    formatColumnNotes(ds),
    "Kwaliteitsrapport:",
    formatQuality(ds.quality),
    "Bespreek wat opvalt (bijna-identieke kanalen, gaten, opvallende weken) in gewone taal, zoals je dat tegen een marketeer zonder statistiekachtergrond zou zeggen. Stel alleen een nieuw recept voor als er een concrete verbetering nodig is — een reeds goedgekeurde dataset verander je niet zomaar.",
  ].join("\n");
}
