import Anthropic from "@anthropic-ai/sdk";
import type { ColumnMapping, ColumnMappingEntry, ColumnRole, SourceProfile } from "@/lib/types";

// A separate, cheap column-semantics classification (see /api/classify-columns): given one
// uploaded file's header + a preview + its statistical profile, decide per column what it
// means (kpi / spend / control / date / ignore), its unit/currency, and the file's shape
// (weekly vs daily, wide vs long). The result is cached on source_files.mapping and fed to
// the architect so it starts each chat turn from a reliable mapping instead of re-deriving
// column roles from 15 raw rows every time.
//
// Deliberately on Haiku (cheap, bounded, structured) and forced through a single tool call —
// this is a classification task, not the architect's open-ended reasoning.

const CLASSIFY_MODEL = "claude-haiku-4-5";

const SYSTEM = `Je bent een data-classificatie-assistent voor een Media Mix Model (MMM). Je krijgt de kolomkoppen, een paar voorbeeldrijen en een statistisch profiel van één geüpload databestand. Bepaal per kolom de betekenis en rol, en de vorm van het bestand. Verzin geen zakelijke context; classificeer alleen wat de kolomnaam, de waarden en het profiel ondersteunen.

Rollen:
- "date": de datum-/weekkolom.
- "kpi": de doelvariabele (omzet, leads, conversies) — meestal precies één per bestand.
- "spend": marketinguitgaven of -volume per kanaal (ook niet-monetair, zoals e-mailverzendingen).
- "control": overige verklarende variabelen (prijs, weer, voorraad) die geen eigen kanaal-effect krijgen.
- "ignore": id's, vrije tekst, of kolommen die niet in het model horen.

Vorm van het bestand:
- granularity: "week" (één rij per week), "day" (één rij per dag) of "onbekend".
- layout: "breed" (één kolom per kanaal) of "lang" (een kanaalnaam-kolom + een waarde-kolom die per rij een ander kanaal beschrijft) of "onbekend".
- currency: de valuta als die te herleiden is (bv. "EUR"), anders null.

Geef per kolom een confidence ("hoog"/"middel"/"laag") en, bij twijfel, een korte "meaning" die de bouwer kan controleren. Roep altijd de tool "classify_columns" aan.`;

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_columns",
  description: "Geef de kolom-semantiek en de vorm van het bestand terug.",
  input_schema: {
    type: "object",
    properties: {
      granularity: { type: "string", enum: ["week", "day", "onbekend"] },
      layout: { type: "string", enum: ["breed", "lang", "onbekend"] },
      currency: { type: "string", description: "Valuta zoals 'EUR', of laat weg als onbekend." },
      reasoning: { type: "string", description: "Korte onderbouwing voor de bouwer." },
      columns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: { type: "string", enum: ["kpi", "spend", "control", "date", "ignore"] },
            meaning: { type: "string", description: "Wat de kolom meet, in gewone taal." },
            unit: { type: "string", description: "Eenheid zoals 'euro', 'cent', 'clicks'; laat weg indien onbekend." },
            confidence: { type: "string", enum: ["hoog", "middel", "laag"] },
          },
          required: ["name", "role", "meaning", "confidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["granularity", "layout", "reasoning", "columns"],
    additionalProperties: false,
  },
};

function formatProfileForClassify(profile: SourceProfile | null): string {
  if (!profile) return "(geen statistisch profiel beschikbaar)";
  const lines = [`${profile.n_rows} rijen; datumkolom: ${profile.date_column ?? "onbekend"}.`];
  for (const c of profile.columns) {
    if (c.kind === "numeric") {
      lines.push(
        `  • ${c.name} (numeriek): bereik ${c.min ?? "?"}–${c.max ?? "?"}, gemiddeld ${c.mean?.toFixed(0) ?? "?"}, ${c.n_missing} ontbrekend`,
      );
    } else {
      lines.push(`  • ${c.name} (${c.kind})`);
    }
  }
  return lines.join("\n");
}

export function buildClassifyRequest(
  fileName: string,
  preview: string,
  profile: SourceProfile | null,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: CLASSIFY_MODEL,
    max_tokens: 1500,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_columns" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Bestand "${fileName}".\n\nEerste regels:\n${preview}\n\nStatistisch profiel:\n${formatProfileForClassify(profile)}`,
      },
    ],
  };
}

// Narrow the tool input (unknown shape) into our typed ColumnMapping. Anything malformed is
// dropped rather than trusted — the mapping is an advisory hint, not a hard contract.
export function parseColumnMapping(input: unknown): ColumnMapping | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const rawCols = Array.isArray(raw.columns) ? raw.columns : [];
  const columns: ColumnMappingEntry[] = [];
  for (const c of rawCols) {
    if (!c || typeof c !== "object") continue;
    const rc = c as Record<string, unknown>;
    if (typeof rc.name !== "string") continue;
    const role = rc.role;
    const validRole =
      role === "kpi" || role === "spend" || role === "control" || role === "date" || role === "ignore";
    columns.push({
      name: rc.name,
      role: validRole ? (role as ColumnRole | "date" | "ignore") : "ignore",
      meaning: typeof rc.meaning === "string" ? rc.meaning : "",
      unit: typeof rc.unit === "string" ? rc.unit : null,
      confidence:
        rc.confidence === "hoog" || rc.confidence === "middel" || rc.confidence === "laag"
          ? rc.confidence
          : "laag",
    });
  }
  if (columns.length === 0) return null;
  const granularity =
    raw.granularity === "week" || raw.granularity === "day" ? raw.granularity : "onbekend";
  const layout = raw.layout === "breed" || raw.layout === "lang" ? raw.layout : "onbekend";
  return {
    granularity,
    layout,
    currency: typeof raw.currency === "string" ? raw.currency : null,
    columns,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
  };
}
