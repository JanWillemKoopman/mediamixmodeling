import type {
  ColumnMapping,
  DataInspection,
  ProjectContext,
  SourceProfile,
} from "@/lib/types";

// Formatters that turn the new "more eyes / more brains" inputs into compact Dutch text for
// the architect prompt: the full-series statistical profile and column mapping cached on
// each source (points 2 + 5), the deep code_execution inspection (point 1), and the
// elicited business context (point 4). Kept pure and free of Next/Supabase so they can be
// unit-smoke-tested and reused by both the chat route and the auto-refine loop.

export function formatSourceProfileBlock(profile: SourceProfile | null): string {
  if (!profile) return "";
  const lines: string[] = [];
  lines.push(
    `Volledige-reeks-profiel: ${profile.n_rows} rijen${
      profile.date_range ? `, periode ${profile.date_range[0]} t/m ${profile.date_range[1]}` : ""
    }.`,
  );
  for (const c of profile.columns) {
    if (c.kind !== "numeric") continue;
    const parts = [
      `gem ${c.mean?.toFixed(0) ?? "?"}`,
      `bereik ${c.min?.toFixed(0) ?? "?"}–${c.max?.toFixed(0) ?? "?"}`,
      `sd ${c.std?.toFixed(0) ?? "?"}`,
    ];
    if (c.n_missing > 0) parts.push(`${c.n_missing} ontbrekend (langste gat ${c.longest_missing_run})`);
    lines.push(`  • ${c.name}: ${parts.join(", ")}`);
    if (c.outliers.length > 0) {
      const os = c.outliers
        .slice(0, 4)
        .map((o) => `${o.label}=${o.value.toFixed(0)} (z=${o.z})`)
        .join("; ");
      lines.push(`      uitschieters: ${os}`);
    }
  }
  if (profile.high_correlations.length > 0) {
    const cs = profile.high_correlations
      .map((h) => `${h.a}~${h.b} (r=${h.r})`)
      .join("; ");
    lines.push(`  Sterk gecorreleerde kolommen (mogelijke multicollineariteit): ${cs}`);
  }
  return lines.join("\n");
}

export function formatColumnMappingBlock(mapping: ColumnMapping | null): string {
  if (!mapping) return "";
  const cols = mapping.columns
    .map((c) => `${c.name}→${c.role}${c.unit ? ` [${c.unit}]` : ""} (${c.confidence})`)
    .join(", ");
  return [
    `Voorlopige kolom-classificatie (granulariteit ${mapping.granularity}, vorm ${mapping.layout}${
      mapping.currency ? `, valuta ${mapping.currency}` : ""
    }): ${cols}`,
    mapping.reasoning ? `  (${mapping.reasoning})` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatInspectionBlock(inspection: DataInspection | null): string {
  if (!inspection) {
    return "Er is nog geen diepe data-inspectie gedraaid. Stel de bouwer voor om er één te draaien (knop 'Diepe data-inspectie') als je meer zekerheid over de data wilt dan de profielen geven.";
  }
  if (inspection.error) {
    return `De laatste diepe data-inspectie is mislukt: ${inspection.error}`;
  }
  const lines = [
    `Diepe data-inspectie (${inspection.scope === "master" ? "op de samengevoegde master" : "op de ruwe bronnen"}, ${inspection.created_at.slice(0, 10)}):`,
  ];
  for (const f of inspection.findings ?? []) {
    const sev = f.severity === "belangrijk" ? "BELANGRIJK" : f.severity === "let_op" ? "let op" : "info";
    const col = f.column ? ` [${f.column}]` : "";
    lines.push(`  • (${sev}${col}) ${f.detail}`);
    if (f.suggestion) lines.push(`      → voorstel: ${f.suggestion}`);
  }
  if (inspection.narrative) lines.push(`Samenvatting: ${inspection.narrative}`);
  return lines.join("\n");
}

export function formatBusinessContextBlock(ctx: ProjectContext | null): string {
  const description = ctx?.description?.trim() ?? "";
  if (!ctx || (!ctx.industry && !description && (!ctx.notes || ctx.notes.length === 0))) {
    return "Er is nog geen zakelijke context vastgelegd voor dit project. Elicit actief: vraag naar branche, seizoensdrukte, bekende campagnes/acties, offline-kanalen met lange nawerking en eerdere lift-/geo-experimenten, en leg de antwoorden vast met de tool 'record_business_context'. Deze kennis vertaal je later naar channel_type, l_max, expected_half_life, priors en calibration.";
  }
  const lines: string[] = [];
  if (description) {
    lines.push("Bedrijfscontext (door de bouwer beschreven):");
    lines.push(description);
  }
  if (ctx.industry) lines.push(`Branche: ${ctx.industry}.`);
  if (ctx.notes && ctx.notes.length > 0) {
    lines.push("Vastgelegde zakelijke context:");
    for (const n of ctx.notes) {
      lines.push(`  • [${n.topic}]${n.relates_to ? ` (${n.relates_to})` : ""} ${n.fact}`);
    }
  }
  lines.push(
    "Gebruik dit om priors/kalibratie/channel_type te onderbouwen; blijf bij de feiten die hier staan.",
  );
  return lines.join("\n");
}
