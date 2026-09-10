// De vertaalslag van stap 2 tot en met 4: het oordeel over een bestand, de bevindingen die
// de gebruiker een keuze voorleggen, en het recept dat daaruit volgt.
//
// De grens die deze tests bewaken: er mag niets worden voorgelegd wat de rekenkern niet kan
// uitvoeren. Een keuzemenu dat iets belooft wat `mmm_core.ingestion` weigert, is precies de
// soort belofte die de oude wizard deed.

import { describe, expect, it } from "vitest";
import { analyseProfile, checkSource, weeksCovered } from "@/lib/flow/dataCheck";
import { buildRecipe, isoWeek } from "@/lib/flow/recipe";
import type { ColumnMapping, ProfileColumnStats, SourceFile, SourceProfile } from "@/lib/types";

function column(name: string, over: Partial<ProfileColumnStats> = {}): ProfileColumnStats {
  return {
    name,
    kind: "numeric",
    n: 104,
    n_missing: 0,
    min: 0,
    max: 100,
    mean: 50,
    std: 10,
    p25: 40,
    p50: 50,
    p75: 60,
    longest_missing_run: 0,
    outliers: [],
    ...over,
  };
}

function profile(over: Partial<SourceProfile> = {}): SourceProfile {
  return {
    n_rows: 104,
    date_column: "week",
    date_range: ["2024-01-01", "2025-12-29"],
    columns: [column("omzet"), column("tv"), column("prijs")],
    high_correlations: [],
    ...over,
  };
}

const MAPPING: ColumnMapping = {
  granularity: "week",
  layout: "breed",
  currency: "EUR",
  reasoning: "",
  columns: [
    { name: "week", role: "date", meaning: "", unit: null, confidence: "hoog" },
    { name: "omzet", role: "kpi", meaning: "", unit: null, confidence: "hoog" },
    { name: "tv", role: "spend", meaning: "", unit: "currency", confidence: "hoog" },
    { name: "prijs", role: "control", meaning: "", unit: null, confidence: "hoog" },
  ],
};

const SOURCE = { id: "src-1", name: "verkoop.csv" } as SourceFile;

describe("het oordeel over een aangeleverd bestand", () => {
  it("telt weken los van dag- of weekregels", () => {
    expect(weeksCovered(profile({ date_range: ["2025-01-06", "2025-12-29"] }))).toBe(51);
    expect(weeksCovered(profile({ date_range: null }))).toBeNull();
    // Een omgekeerde of nulperiode is geen negatief aantal weken maar onbekend.
    expect(weeksCovered(profile({ date_range: ["2025-12-29", "2025-01-06"] }))).toBeNull();
  });

  it("keurt een te korte reeks af, met de reden erbij", () => {
    const check = checkSource(profile({ date_range: ["2025-06-01", "2025-09-01"] }));
    expect(check.verdict).toBe("not_usable");
    expect(check.points.some((p) => p.tone === "blocking" && p.text.includes("weken"))).toBe(true);
  });

  it("laat een korte-maar-bruikbare reeks door mét waarschuwing", () => {
    const check = checkSource(profile({ date_range: ["2025-01-06", "2025-09-29"] }));
    expect(check.verdict).toBe("usable_with_warnings");
  });

  it("weigert een bestand zonder datumkolom", () => {
    expect(checkSource(profile({ date_column: null })).verdict).toBe("not_usable");
  });

  it("weigert een bestand met te weinig getalkolommen", () => {
    expect(checkSource(profile({ columns: [column("omzet")] })).verdict).toBe("not_usable");
  });

  it("zegt bij een onleesbaar bestand wat er aan de hand is", () => {
    const check = checkSource(null);
    expect(check.verdict).toBe("not_usable");
    expect(check.points[0].text.length).toBeGreaterThan(20);
  });
});

describe("wat er aan de gebruiker wordt voorgelegd", () => {
  it("legt een gat in een kanaal niet als keuze voor — dat leest de rekenkern al als nul", () => {
    const { findings, notes } = analyseProfile(
      profile({ columns: [column("omzet"), column("tv", { longest_missing_run: 4 })] }),
      MAPPING,
    );
    expect(findings.filter((f) => f.kind === "gap")).toEqual([]);
    expect(notes.some((n) => n.includes("tv") && n.includes("nul"))).toBe(true);
  });

  it("legt een gat in het resultaat niet als keuze voor — dat wordt nooit verzonnen", () => {
    const { findings, notes } = analyseProfile(
      profile({ columns: [column("omzet", { longest_missing_run: 3 }), column("tv")] }),
      MAPPING,
    );
    expect(findings.filter((f) => f.kind === "gap")).toEqual([]);
    expect(notes.some((n) => n.includes("omzet"))).toBe(true);
  });

  it("legt een gat in een control wél voor, met alleen strategieën die bestaan", () => {
    const { findings } = analyseProfile(
      profile({ columns: [column("omzet"), column("tv"), column("prijs", { longest_missing_run: 5 })] }),
      MAPPING,
    );
    const gap = findings.find((f) => f.kind === "gap");
    expect(gap).toBeDefined();
    // Deze vijf kent mmm_core.ingestion.spec; alles daarbuiten wordt daar geweigerd.
    const allowed = new Set(["zero", "ffill", "bfill", "interpolate", "mean", "median", "keep"]);
    for (const choice of gap!.choices) expect(allowed.has(choice.id), choice.id).toBe(true);
  });

  it("vraagt bij een piek in het resultaat of daar iets speelde", () => {
    const { findings } = analyseProfile(
      profile({
        columns: [
          column("omzet", { outliers: [{ label: "2025-11-28", value: 99999, z: 4.2 }] }),
          column("tv"),
        ],
      }),
      MAPPING,
    );
    const outlier = findings.find((f) => f.kind === "outlier");
    expect(outlier).toBeDefined();
    expect(outlier!.headline).toContain("2025-11-28");
    // Standaard verandert er niets: iets apart zetten is een keuze van de gebruiker.
    expect(outlier!.defaultChoice).toBe("keep");
  });

  it("meldt kanalen die niet los te beoordelen zijn", () => {
    const { findings } = analyseProfile(
      profile({ high_correlations: [{ a: "tv", b: "prijs", r: 0.97 }] }),
      MAPPING,
    );
    expect(findings.some((f) => f.kind === "duplicate")).toBe(true);
  });

  it("zwijgt over zwakke samenhang", () => {
    const { findings } = analyseProfile(
      profile({ high_correlations: [{ a: "tv", b: "prijs", r: 0.6 }] }),
      MAPPING,
    );
    expect(findings.some((f) => f.kind === "duplicate")).toBe(false);
  });

  it("geeft elke keuze een uitleg van wat hij doet", () => {
    const { findings } = analyseProfile(
      profile({
        columns: [
          column("omzet", { outliers: [{ label: "2025-11-28", value: 9999, z: 4 }] }),
          column("tv"),
          column("prijs", { longest_missing_run: 4 }),
        ],
        high_correlations: [{ a: "tv", b: "prijs", r: 0.95 }],
      }),
      MAPPING,
    );
    expect(findings.length).toBeGreaterThan(2);
    for (const finding of findings) {
      expect(finding.choices.length, finding.id).toBeGreaterThan(1);
      for (const choice of finding.choices) {
        expect(choice.effect.length, `${finding.id}/${choice.id}`).toBeGreaterThan(10);
      }
      // De standaardkeuze moet bestaan, anders staat de kaart op niets.
      expect(finding.choices.some((c) => c.id === finding.defaultChoice), finding.id).toBe(true);
    }
  });
});

describe("ISO-weken", () => {
  it("zet een datum om naar het juiste ISO-jaar en weeknummer", () => {
    expect(isoWeek(new Date("2025-01-06"))).toEqual([2025, 2]);
    expect(isoWeek(new Date("2025-11-28"))).toEqual([2025, 48]);
  });

  it("kent het jaareinde, waar het ISO-jaar afwijkt van het kalenderjaar", () => {
    // 30 december 2025 valt in ISO-week 1 van 2026. Precies de fout die een event-dummy
    // stilletjes op de verkeerde week zet.
    expect(isoWeek(new Date("2025-12-30"))).toEqual([2026, 1]);
    expect(isoWeek(new Date("2026-01-01"))).toEqual([2026, 1]);
    // En andersom: 1 januari 2023 hoort nog bij week 52 van 2022.
    expect(isoWeek(new Date("2023-01-01"))).toEqual([2022, 52]);
  });
});

describe("het recept dat uit de keuzes volgt", () => {
  it("neemt kpi, kanalen en controls mee en noemt het bestand bij zijn rij-id", () => {
    const { recipe, problem } = buildRecipe(SOURCE, MAPPING, {});
    expect(problem).toBeNull();
    expect(recipe!.sources[0].source_file_id).toBe("src-1");
    expect(recipe!.sources[0].date_column).toBe("week");
    expect(recipe!.sources[0].columns.map((c) => c.name).sort()).toEqual(["omzet", "prijs", "tv"]);
  });

  it("zet een fill alleen op een control", () => {
    // Op een andere rol weigert mmm_core.ingestion.spec het, en dan struikelt pas de worker.
    const { recipe } = buildRecipe(SOURCE, MAPPING, { "gap:prijs": "ffill", "gap:tv": "ffill" });
    const byName = new Map(recipe!.sources[0].columns.map((c) => [c.name, c]));
    expect(byName.get("prijs")!.fill).toBe("ffill");
    expect(byName.get("tv")!.fill).toBeUndefined();
  });

  it("negeert een fill-strategie die niet bestaat", () => {
    const { recipe } = buildRecipe(SOURCE, MAPPING, { "gap:prijs": "verzin_maar_iets" });
    expect(recipe!.sources[0].columns.find((c) => c.name === "prijs")!.fill).toBeUndefined();
  });

  it("laat een kolom weg die de gebruiker heeft laten vallen", () => {
    const { recipe } = buildRecipe(SOURCE, MAPPING, { "duplicate:tv:prijs": "drop_b" });
    expect(recipe!.sources[0].columns.map((c) => c.name)).not.toContain("prijs");
    expect(recipe!.sources[0].columns.map((c) => c.name)).toContain("tv");
  });

  it("weigert een recept zonder kanalen, en zegt waarom", () => {
    const { recipe, problem } = buildRecipe(SOURCE, MAPPING, { "duplicate:tv:prijs": "drop_a" });
    expect(recipe).toBeNull();
    expect(problem).toContain("kanaal");
  });

  it("maakt van een gemarkeerde piek een bijzondere week", () => {
    const { recipe } = buildRecipe(SOURCE, MAPPING, { "outlier:omzet:2025-11-28": "event" });
    expect(recipe!.event_dummies).toHaveLength(1);
    expect(recipe!.event_dummies![0].weeks).toEqual([[2025, 48]]);
  });

  it("voegt twee pieken in dezelfde week samen tot één dummy", () => {
    const { recipe } = buildRecipe(SOURCE, MAPPING, {
      "outlier:omzet:2025-11-25": "event",
      "outlier:omzet:2025-11-28": "event",
    });
    expect(recipe!.event_dummies).toHaveLength(1);
  });

  it("laat een onleesbare datum vallen in plaats van een verkeerde week te maken", () => {
    const { recipe } = buildRecipe(SOURCE, MAPPING, { "outlier:omzet:geen datum": "event" });
    expect(recipe!.event_dummies).toBeUndefined();
  });

  it("weigert zonder datum- of resultaatkolom, en zegt waarom", () => {
    const zonderKpi: ColumnMapping = {
      ...MAPPING,
      columns: MAPPING.columns.filter((c) => c.role !== "kpi"),
    };
    expect(buildRecipe(SOURCE, zonderKpi, {}).problem).toContain("resultaat");
    const zonderDatum: ColumnMapping = {
      ...MAPPING,
      columns: MAPPING.columns.filter((c) => c.role !== "date"),
    };
    expect(buildRecipe(SOURCE, zonderDatum, {}).problem).toContain("datum");
  });
});
