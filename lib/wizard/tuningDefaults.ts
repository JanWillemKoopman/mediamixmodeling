import type { ChannelIntent, ColumnRole, DatasetVersion, ModelIntent } from "@/lib/types";

// A starting intent built purely from the dataset's confirmed column roles — no AI call, no
// numbers. It is what the "just use the recommendation" path submits when the user does not
// want a conversation about it, and what the architect starts from when they do.
//
// Every belief defaults to "unknown" on purpose. That is not a placeholder: "unknown" is a
// real, honest answer that tells the model to let the data speak rather than an assumption.
// The alternative — quietly defaulting to "moderate" everywhere — would state beliefs the
// user never had.
export function templateIntentFromDataset(dataset: DatasetVersion): ModelIntent {
  const roles = dataset.column_roles ?? {};
  const units = dataset.column_units ?? {};
  const byRole = (role: ColumnRole) =>
    Object.entries(roles)
      .filter(([, r]) => r === role)
      .map(([name]) => name);

  const channels: ChannelIntent[] = byRole("spend").map((name) => ({
    name,
    // Currency unless the merge recorded otherwise. Worth a look from the user: treating a
    // GRP column as euros is invisible in the results and wrecks the budget advice.
    unit: units[name] ?? "currency",
    role: "mixed",
    carryover: "unknown",
    strength: "unknown",
    saturation: "unknown",
  }));

  return {
    kpi: byRole("kpi")[0] ?? "",
    // Revenue is the safe default because it is the only KPI type that never forces a count
    // likelihood; the architect corrects it when the KPI is clearly orders or leads.
    kpi_type: "revenue",
    channels,
    control_columns: byRole("control"),
    seasonality: "unknown",
    expect_trend: true,
    expect_structural_break: false,
  };
}

/** Human-readable summary of an intent, for confirming it before anything runs. */
export function describeIntent(intent: ModelIntent): string {
  const lines = [`**KPI**: ${intent.kpi} (${intent.kpi_type})`];
  lines.push(
    `**Kanalen** (${intent.channels.length}): ` +
      intent.channels
        .map((c) => `${c.name} — ${c.unit}${c.carryover && c.carryover !== "unknown" ? `, na-ijl ${c.carryover}` : ""}`)
        .join("; "),
  );
  if (intent.control_columns?.length) {
    lines.push(`**Overige variabelen**: ${intent.control_columns.join(", ")}`);
  }
  if (intent.seasonality && intent.seasonality !== "unknown") {
    lines.push(`**Seizoen**: ${intent.seasonality}`);
  }
  if (intent.media_share_belief) {
    lines.push(`**Verwacht aandeel van marketing**: ${intent.media_share_belief}`);
  }
  return lines.join("\n");
}
