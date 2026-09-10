// Wat er daadwerkelijk de deur uit gaat naar het model.
//
// Deze twee aanvragen dragen de grootste invoer in de hele applicatie: een FitSummary met
// weekreeksen is doorgeïndenteerd tienduizenden tokens. Wat er wél en niet in zit, en waar het
// breekpunt voor hergebruik staat, is daarmee een eigenschap die stilzwijgend kan wegvallen —
// een `JSON.stringify(x, null, 2)` die terugsluipt kost per aanroep het dubbele zonder dat
// iemand het merkt, en een weggevallen breekpunt kost bij elke hervatting de volle prijs.
// Vandaar deze toetsen: ze gaan niet over de uitkomst van het model maar over de rekening.

import { describe, expect, it } from "vitest";
import { buildClientSummaryRequest } from "@/lib/anthropic/clientSummary";
import { buildDeepAnalysisRequest } from "@/lib/anthropic/deepAnalysis";
import type { ChannelResult, FitSummary, Interval } from "@/lib/types";

const iv = (p50: number): Interval => ({ p3: p50 * 0.8, p50, p97: p50 * 1.2 });

function channel(name: string): ChannelResult {
  return {
    name,
    absolute_contribution: iv(120_000),
    contribution_share: iv(0.2),
    roas: iv(2.4),
    adstock_half_life_weeks: iv(2),
    saturation_point: iv(5000),
    total_spend: 50_000,
    unit: "currency",
  };
}

const WEEKS = 104;
const dates = Array.from({ length: WEEKS }, (_, i) => `2024-01-0${(i % 9) + 1}`);
const series = Array.from({ length: WEEKS }, (_, i) => 1000 + i);

const SUMMARY: FitSummary = {
  kpi: "omzet",
  kpi_type: "revenue",
  n_weeks: WEEKS,
  window: ["2024-01-01", "2025-12-29"],
  baseline_contribution: iv(400_000),
  channels: [channel("tv"), channel("social")],
  diagnostics: {
    max_r_hat: 1.01,
    min_ess_bulk: 900,
    min_ess_tail: 800,
    n_divergences: 0,
    min_e_bfmi: 0.9,
    n_max_treedepth: 0,
    r2: 0.82,
    mape: 0.09,
    interval_coverage_94: 0.94,
    interval_coverage_80: 0.8,
    interval_coverage_50: 0.5,
    residual_autocorrelation: 0.04,
    decomposition_ok: true,
  },
  draws: 1000,
  chains: 4,
  validation: null,
  identifiability: [],
  weekly: {
    dates,
    observed: series,
    expected_p50: series,
    expected_p3: series,
    expected_p97: series,
    baseline_p50: series,
    channels_p50: { tv: series, social: series },
    burn_in_weeks: 4,
  },
  baseline_decomposition: {
    dates,
    components: { trend: series, seizoen: series },
    control_names: ["prijs"],
  },
};

/** De tekst van het eerste (en enige) gebruikersbericht, los van hoe het verpakt zit. */
function userText(content: unknown): string {
  if (typeof content === "string") return content;
  return (content as { type: string; text?: string }[])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

function payloadOf(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  return JSON.parse(text.slice(start)) as Record<string, unknown>;
}

describe("de klantsamenvatting", () => {
  it("stuurt de weekreeksen niet mee", () => {
    const request = buildClientSummaryRequest(SUMMARY);
    const payload = payloadOf(userText(request.messages[0].content));

    // Deze samenvatting gaat over het geheel en noemt per definitie geen afzonderlijke week.
    // De reeksen zijn samen het grootste deel van de JSON en dragen hier niets bij.
    expect(payload).not.toHaveProperty("weekly");
    expect(payload).not.toHaveProperty("baseline_decomposition");
  });

  it("laat al het andere ongemoeid", () => {
    const request = buildClientSummaryRequest(SUMMARY);
    const payload = payloadOf(userText(request.messages[0].content));

    // Precies twee velden minder, geen derde. Een samenvatting die haar eigen cijfers mist,
    // verzint ze — en dat is exact het gedrag dat de getallencontrole afkeurt.
    const expected = Object.keys(SUMMARY).filter((k) => k !== "weekly" && k !== "baseline_decomposition");
    expect(Object.keys(payload).sort()).toEqual(expected.sort());
    expect(payload.channels).toHaveLength(SUMMARY.channels.length);
  });

  it("verstuurt compacte JSON", () => {
    const text = userText(buildClientSummaryRequest(SUMMARY).messages[0].content);
    // Doorgeïndenteerd bestaat ongeveer de helft van de tekens uit spaties, en het model leest
    // de structuur er even goed uit.
    expect(text).not.toMatch(/\{\n\s+"/);
  });
});

describe("de uitgebreide analyse", () => {
  it("houdt de weekreeksen wél bij zich", () => {
    const payload = payloadOf(userText(buildDeepAnalysisRequest(SUMMARY).messages[0].content));
    // Hier worden grafieken van gemaakt; zonder reeks is er niets te plotten over de tijd.
    expect(payload).toHaveProperty("weekly");
  });

  it("verstuurt compacte JSON", () => {
    const text = userText(buildDeepAnalysisRequest(SUMMARY).messages[0].content);
    expect(text).not.toMatch(/\{\n\s+"/);
  });

  it("zet een breekpunt op de invoer, zodat een hervatting niet opnieuw vol betaald wordt", () => {
    const content = buildDeepAnalysisRequest(SUMMARY).messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    const blocks = content as { cache_control?: { type: string } }[];
    // Eén breekpunt, en wel op het laatste blok: de lus pauzeert na tien gereedschapsstappen en
    // hervatten betekent dezelfde aanvraag opnieuw versturen (zie app/api/analysis/route.ts).
    const marked = blocks.filter((b) => b.cache_control?.type === "ephemeral");
    expect(marked).toHaveLength(1);
    expect(marked[0]).toBe(blocks[blocks.length - 1]);
  });
});
