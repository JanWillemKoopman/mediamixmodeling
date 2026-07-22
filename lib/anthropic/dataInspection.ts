import Anthropic from "@anthropic-ai/sdk";
import type { InspectionFinding } from "@/lib/types";

// Deep data inspection — the structural fix for "Claude barely sees the data". Where the
// statistical profile (lib/dataProfile.ts) is a cheap client-side summary, this hands the
// ACTUAL file(s) to Claude in the hosted, sandboxed code_execution container and lets it
// explore with pandas: full time series, seasonality, level shifts, outliers across the
// whole period, and multicollinearity between spend channels. It reports back structured
// findings (each with a concrete recipe/config suggestion) plus a narrative, both stored on
// mmm.data_inspections and fed into the architect context.
//
// Uses the same beta code_execution surface as lib/anthropic/deepAnalysis.ts. The container
// is network-isolated and only sees the CSV bytes we upload — nothing else about the project.

const CODE_EXECUTION_BETA = "code-execution-2025-08-25";
const FILES_BETA = "files-api-2025-04-14";
// The brains step. Kept on the same model as the rest of the architect for cost; point it at
// a stronger model (e.g. claude-opus-4-8) if the inspections warrant it.
export const INSPECTION_MODEL = "claude-sonnet-5";

const SYSTEM_INSTRUCTIONS = `Je bent een senior data-analist die marketingdata voorbereidt voor een Media Mix Model (MMM). Je krijgt één of meer CSV-bestanden in de code-execution-omgeving. Onderzoek de data GRONDIG met Python (pandas) en rapporteer wat een MMM-bouwer moet weten VOORDAT hij een model configureert.

Doe minstens dit met code:
1. Lees elk bestand, bepaal de datumkolom en de granulariteit (dag/week), en de dekkende periode.
2. Voor elke numerieke kolom: verdeling, trend over de tijd, en uitschieters (noem de exacte week/datum + waarde).
3. Detecteer NIVEAUBREUKEN (structurele sprongen in het gemiddelde) in de KPI of in kanalen.
4. Onderzoek SEIZOEN: is er een terugkerend jaarlijks/patroonmatig effect in de KPI?
5. Bereken de CORRELATIEMATRIX tussen spend-kolommen en tussen spend en KPI; benoem sterk gecorreleerde kanalen (multicollineariteit) en kanalen zonder duidelijke relatie met de KPI.
6. Benoem gaten (ontbrekende weken) en of ze aaneengesloten of verspreid zijn.

Regels:
- Baseer je uitsluitend op wat je in de data ziet — verzin geen zakelijke context.
- Elke bevinding die tot een concrete actie leidt, koppel je aan een suggestie in MMM-termen (event-dummy voor week X, adstock 'delayed' voor een kanaal met lange nawerking, een control weglaten wegens multicollineariteit, seizoen aanzetten, likelihood 'student_t' bij zware uitschieters, enz.).
- Sluit af door de tool "report_data_findings" aan te roepen met een gestructureerde lijst bevindingen én een korte doorlopende samenvatting in het Nederlands. Roep die tool precies één keer aan, als laatste stap.`;

const REPORT_TOOL: Anthropic.Beta.Messages.BetaTool = {
  name: "report_data_findings",
  description:
    "Rapporteer de bevindingen van de data-inspectie: een gestructureerde lijst plus een korte samenvatting. Roep dit als laatste stap aan, na je analyse met code.",
  input_schema: {
    type: "object",
    properties: {
      narrative: { type: "string", description: "Korte doorlopende samenvatting in het Nederlands." },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: [
                "outlier",
                "level_shift",
                "seasonality",
                "collinearity",
                "gap",
                "trend",
                "distribution",
                "other",
              ],
            },
            column: { type: "string", description: "Kolom waar het over gaat, of laat weg." },
            detail: { type: "string", description: "De bevinding, met concrete weken/waarden." },
            suggestion: { type: "string", description: "Concreet MMM-voorstel dat hieruit volgt, of laat weg." },
            severity: { type: "string", enum: ["info", "let_op", "belangrijk"] },
          },
          required: ["kind", "detail", "severity"],
          additionalProperties: false,
        },
      },
    },
    required: ["narrative", "findings"],
    additionalProperties: false,
  },
};

export function buildInspectionRequest(
  fileIds: string[],
  fileNames: string[],
): Anthropic.Beta.Messages.MessageCreateParamsNonStreaming {
  const fileList = fileNames.map((n, i) => `- ${n} (file ${i + 1})`).join("\n");
  const uploads: Anthropic.Beta.Messages.BetaContentBlockParam[] = fileIds.map((id) => ({
    type: "container_upload",
    file_id: id,
  }));
  return {
    model: INSPECTION_MODEL,
    max_tokens: 12000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    betas: [CODE_EXECUTION_BETA, FILES_BETA],
    tools: [{ type: "code_execution_20260521", name: "code_execution" }, REPORT_TOOL],
    system: SYSTEM_INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Onderzoek de volgende bestand(en):\n${fileList}` },
          ...uploads,
        ],
      },
    ],
  };
}

// Narrow the report_data_findings tool input into typed findings + narrative.
export function parseInspectionResult(
  input: unknown,
): { findings: InspectionFinding[]; narrative: string } | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const rawFindings = Array.isArray(raw.findings) ? raw.findings : [];
  const kinds = [
    "outlier",
    "level_shift",
    "seasonality",
    "collinearity",
    "gap",
    "trend",
    "distribution",
    "other",
  ];
  const findings: InspectionFinding[] = [];
  for (const f of rawFindings) {
    if (!f || typeof f !== "object") continue;
    const rf = f as Record<string, unknown>;
    if (typeof rf.detail !== "string") continue;
    findings.push({
      kind: (kinds.includes(rf.kind as string) ? rf.kind : "other") as InspectionFinding["kind"],
      column: typeof rf.column === "string" ? rf.column : null,
      detail: rf.detail,
      suggestion: typeof rf.suggestion === "string" ? rf.suggestion : null,
      severity:
        rf.severity === "belangrijk" || rf.severity === "let_op" ? rf.severity : "info",
    });
  }
  return { findings, narrative: typeof raw.narrative === "string" ? raw.narrative : "" };
}
