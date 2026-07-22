// Fase "prepare_recipe" — data opschonen & verrijken. Geen losse formulieren voor
// fill-strategie/events/features meer: één open vraag, met een standaardrecept (geen fill,
// geen events/features) als de bouwer niets bijzonders te melden heeft, en anders een
// doorstuur naar de architect (die al een compleet "propose_prepare_recipe"-voorstel kan
// doen — zie lib/anthropic/architect.ts). ChatWizard's generieke voorstel-bevestigingslus
// handelt de rest af (tekst + "ja, toepassen"-menu), hier hoeft niets extra's voor.

import { humanizeError } from "@/lib/humanizeMessage";
import { matchOption, type MenuOption } from "@/lib/wizard/questions";
import type { ColumnRole, PrepareRecipe, SourceConfig } from "@/lib/types";
import type { TurnEnv, TurnReplyResult } from "@/lib/wizard/turns/types";

const SKIP_OPTION: MenuOption = { key: "skip", label: "nee", synonyms: ["nee", "geen", "niets", "skip", "nvt"] };

export function intro(env: TurnEnv): string {
  const source = env.source;
  const cols = source?.mapping?.columns ?? [];
  const kpiCol = cols.find((c) => c.role === "kpi")?.name ?? "?";
  const spendCols = cols.filter((c) => c.role === "spend").map((c) => c.name);
  const controlCols = cols.filter((c) => c.role === "control").map((c) => c.name);
  return (
    `KPI **${kpiCol}** · ${spendCols.length} kanalen (${spendCols.join(", ") || "—"})` +
    (controlCols.length ? ` · overig: ${controlCols.join(", ")}` : "") +
    "\n\nZijn er bijzondere periodes (acties, storingen, Black Friday) of afgeleide variabelen die ik mee moet nemen? " +
    "Beschrijf ze in gewone taal, of typ **nee** om met de standaard data door te gaan."
  );
}

function buildDefaultRecipe(env: TurnEnv): PrepareRecipe | null {
  const source = env.source;
  const cols = source?.mapping?.columns ?? [];
  const dateCol = cols.find((c) => c.role === "date")?.name;
  const kpiCol = cols.find((c) => c.role === "kpi")?.name;
  const spendCols = cols.filter((c) => c.role === "spend").map((c) => c.name);
  const controlCols = cols.filter((c) => c.role === "control").map((c) => c.name);
  if (!source || !dateCol || !kpiCol || spendCols.length === 0) return null;
  const columns: SourceConfig["columns"] = [
    { name: kpiCol, role: "kpi" },
    ...spendCols.map((name) => ({ name, role: "spend" as ColumnRole })),
    ...controlCols.map((name) => ({ name, role: "control" as ColumnRole })),
  ];
  return {
    sources: [
      {
        name: source.name.replace(/\.[^.]+$/, ""),
        storage_path: source.storage_path,
        date_column: dateCol,
        columns,
      },
    ],
  };
}

// Fase "prepare_failed" hergebruikt dit hele formulier (zelfde vraag, zelfde resolve) —
// alleen de intro krijgt de foutmelding erboven, zoals de oude kaart dat ook deed.
export function introFailed(env: TurnEnv): string {
  const error = env.dataset?.error ?? "Onbekende fout bij het samenvoegen.";
  return `Het samenvoegen is helaas niet gelukt: ${error}\n\n${intro(env)}`;
}

export async function resolve(env: TurnEnv, reply: string): Promise<TurnReplyResult> {
  const match = matchOption(reply, [SKIP_OPTION]);
  if (!match) return { handled: false };

  const recipe = buildDefaultRecipe(env);
  if (!recipe) return { handled: true, reply: "De kolomherkenning lijkt onvolledig — ga terug naar de vorige stap." };

  const res = await fetch("/api/datasets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: env.projectId, recipe }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return { handled: true, reply: humanizeError(j.error, "Het samenvoegen kon niet gestart worden — probeer het opnieuw.").text };
  }
  return {
    handled: true,
    refresh: true,
    reply:
      "Oké, ik voeg de data samen en controleer de kwaliteit. Dat duurt meestal minder dan een minuut; " +
      "ik laat het hier vanzelf weten zodra het klaar is, dan bekijken we samen het kwaliteitsrapport.",
  };
}
