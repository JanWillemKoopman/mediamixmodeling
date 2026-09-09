// Coherence checks on a stated model intent, before it is stored.
//
// This is not where the statistics live — mmm_core.model.priors turns intent into priors,
// and mmm_core.model.intent validates the vocabulary again server-side. What this file
// catches is the class of mistake a user can fix in seconds: a channel that is not in the
// dataset, a KPI that the merge assigned a different role, a column used twice. Finding
// those here rather than two minutes into a run is the whole point.

import type { ColumnRole, ModelIntent } from "@/lib/types";

const CHANNEL_UNITS = ["currency", "impressions", "grp", "sendings", "clicks"];
const KPI_TYPES = ["revenue", "orders", "leads", "sessions"];
const CHANNEL_ROLES = ["demand_capture", "brand_building", "mixed"];
const CARRYOVER = ["none", "short", "medium", "long", "unknown"];
const STRENGTH = ["small", "moderate", "large", "unknown"];
const SATURATION = ["far_from_saturated", "approaching", "likely_saturated", "unknown"];
const SEASONALITY = ["none", "mild", "strong", "unknown"];
const MEDIA_SHARE = ["small", "moderate", "large", "dominant"];

function checkEnum(value: unknown, allowed: string[], label: string): string | null {
  if (value === undefined || value === null) return null; // optional; the core has a default
  if (typeof value !== "string" || !allowed.includes(value)) {
    return `${label} is '${String(value)}', maar moet één van ${allowed.join(", ")} zijn.`;
  }
  return null;
}

/** Returns user-facing problems, empty when the intent is coherent with the dataset. */
export function validateIntent(
  intent: ModelIntent,
  columnRoles: Record<string, ColumnRole>,
): string[] {
  const problems: string[] = [];

  if (!intent.kpi) problems.push("Er is geen KPI gekozen.");
  const kpiTypeProblem = checkEnum(intent.kpi_type, KPI_TYPES, "Het KPI-type");
  if (kpiTypeProblem) problems.push(kpiTypeProblem);

  if (!intent.channels?.length) {
    problems.push("Er is geen enkel marketingkanaal gekozen.");
  }

  // The dataset's confirmed roles are the ground truth: the merge already decided what each
  // column is, and an intent that disagrees would silently model something else.
  if (intent.kpi && columnRoles[intent.kpi] && columnRoles[intent.kpi] !== "kpi") {
    problems.push(
      `Kolom '${intent.kpi}' is in de dataset vastgelegd als ${columnRoles[intent.kpi]}, niet als KPI.`,
    );
  }
  if (intent.kpi && !columnRoles[intent.kpi]) {
    problems.push(`Kolom '${intent.kpi}' staat niet in de goedgekeurde dataset.`);
  }

  const seen = new Set<string>();
  for (const channel of intent.channels ?? []) {
    if (!channel.name) {
      problems.push("Een kanaal heeft geen kolomnaam.");
      continue;
    }
    if (seen.has(channel.name)) {
      problems.push(`Kanaal '${channel.name}' staat er twee keer in.`);
    }
    seen.add(channel.name);

    if (!columnRoles[channel.name]) {
      problems.push(`Kanaal '${channel.name}' staat niet in de goedgekeurde dataset.`);
    } else if (columnRoles[channel.name] !== "spend") {
      problems.push(
        `Kolom '${channel.name}' is in de dataset vastgelegd als ${columnRoles[channel.name]} en kan geen kanaal zijn.`,
      );
    }

    // The unit is mandatory and has no safe default: treating GRPs as euros makes every
    // budget recommendation meaningless while looking perfectly plausible.
    if (!channel.unit) {
      problems.push(`Voor kanaal '${channel.name}' is niet vastgelegd waarin het gemeten is.`);
    }
    const enumProblems = [
      checkEnum(channel.unit, CHANNEL_UNITS, `De eenheid van '${channel.name}'`),
      checkEnum(channel.role, CHANNEL_ROLES, `De rol van '${channel.name}'`),
      checkEnum(channel.carryover, CARRYOVER, `De na-ijl van '${channel.name}'`),
      checkEnum(channel.strength, STRENGTH, `De verwachte kracht van '${channel.name}'`),
      checkEnum(channel.saturation, SATURATION, `De verzadiging van '${channel.name}'`),
    ].filter((p): p is string => p !== null);
    problems.push(...enumProblems);
  }

  for (const control of intent.control_columns ?? []) {
    if (!columnRoles[control]) {
      problems.push(`Variabele '${control}' staat niet in de goedgekeurde dataset.`);
    } else if (seen.has(control)) {
      problems.push(`Kolom '${control}' is zowel kanaal als overige variabele; kies één rol.`);
    }
  }
  if (intent.kpi && seen.has(intent.kpi)) {
    problems.push(`De KPI '${intent.kpi}' kan niet ook een kanaal zijn.`);
  }

  const seasonProblem = checkEnum(intent.seasonality, SEASONALITY, "De seizoensverwachting");
  if (seasonProblem) problems.push(seasonProblem);
  const shareProblem = checkEnum(
    intent.media_share_belief,
    MEDIA_SHARE,
    "De verwachting over het aandeel van marketing",
  );
  if (shareProblem) problems.push(shareProblem);

  return problems;
}
