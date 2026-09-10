// De vertaalslag van stap 2 tot en met 4: het oordeel over een bestand, de bevindingen die
// de gebruiker een keuze voorleggen, en het recept dat daaruit volgt.
//
// De grens die deze tests bewaken: er mag niets worden voorgelegd wat de rekenkern niet kan
// uitvoeren. Een keuzemenu dat iets belooft wat `mmm_core.ingestion` weigert, is precies de
// soort belofte die de oude wizard deed.

import { describe, expect, it } from "vitest";
import { analyseProfile, checkSource, describeChoices, weeksCovered } from "@/lib/flow/dataCheck";
import { buildRecipe, isoWeek, slug } from "@/lib/flow/recipe";
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

// --- het bewijsmateriaal onder een vraag ------------------------------------------------
//
// Een vraag zonder bewijs is voor deze gebruiker geen vraag. Hij kent zijn eigen weken niet
// uit zijn hoofd: "2025-11-28 springt eruit: 99.999" is een bewering waar hij niets mee kan,
// tot hij ziet wat normaal is, welke weken het betreft en wat de weken eromheen deden. Deze
// tests bewaken dat elke vraag dat meedraagt — en dat hij overeind blijft als het profiel het
// niet heeft (een oud profiel, een te groot bestand).

/** Een weekreeks met labels, zoals lib/dataProfile.ts hem tegenwoordig maakt. */
function weekLabels(n: number): string[] {
  const start = Date.UTC(2025, 0, 6);
  return Array.from({ length: n }, (_, i) =>
    new Date(start + i * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  );
}

describe("waarop een vraag berust", () => {
  it("zegt bij een gat om welke weken het gaat, en wat de buren doen", () => {
    const labels = weekLabels(6);
    const prijs = [10, 12, null, null, 20, 22];
    const { findings } = analyseProfile(
      profile({
        labels,
        n_rows: 6,
        columns: [
          column("omzet"),
          column("tv"),
          column("prijs", {
            longest_missing_run: 2,
            min: 10,
            max: 22,
            p50: 16,
            n_missing: 2,
            series: prijs,
            missing_runs: [{ start: 2, length: 2, start_label: labels[2], end_label: labels[3] }],
          }),
        ],
      }),
      MAPPING,
    );
    const gap = findings.find((f) => f.kind === "gap")!;
    const evidence = gap.evidence!;
    // De weken zelf, niet alleen het aantal.
    expect(evidence.facts.some((f) => f.includes(labels[2]) && f.includes(labels[3]))).toBe(true);
    // En de waarden ervoor en erna — precies wat de keuze tussen doortrekken en interpoleren
    // concreet maakt.
    expect(evidence.facts.some((f) => f.includes("12") && f.includes("20"))).toBe(true);
    expect(evidence.marks).toEqual([{ from: 2, to: 3, tone: "gap" }]);
    expect(evidence.series[0].values).toEqual(prijs);
    // De tabel toont het gat mét zijn buren, en markeert alleen het gat zelf.
    expect(evidence.rows.filter((r) => r.highlight).map((r) => r.label)).toEqual([labels[2], labels[3]]);
    expect(evidence.rows.length).toBeGreaterThan(2);
  });

  it("zet een piek af tegen een gewone week, de buurweken en dezelfde week vorig jaar", () => {
    const labels = weekLabels(60);
    const values = labels.map(() => 100);
    values[57] = 400; // de piek
    values[5] = 380; // dezelfde periode een jaar eerder (52 weken terug)
    const { findings } = analyseProfile(
      profile({
        labels,
        n_rows: 60,
        columns: [
          column("omzet", {
            p50: 100,
            series: values,
            outliers: [{ label: labels[57], value: 400, z: 4.2 }],
          }),
          column("tv"),
        ],
      }),
      MAPPING,
    );
    const evidence = findings.find((f) => f.kind === "outlier")!.evidence!;
    expect(evidence.marks).toEqual([{ from: 57, to: 57, tone: "peak" }]);
    // Hoe ver van normaal, in een verhouding die je kunt navertellen.
    expect(evidence.facts.some((f) => f.includes("4") && f.includes("zo hoog"))).toBe(true);
    // De buurweken.
    expect(evidence.facts.some((f) => f.includes(labels[56]) && f.includes(labels[58]))).toBe(true);
    // Vorig jaar — het feit dat "speelde daar iets bijzonders?" beantwoordbaar maakt: een
    // piek die er vorig jaar ook stond is geen incident maar iets terugkerends.
    expect(evidence.facts.some((f) => f.includes(labels[5]) && f.includes("380"))).toBe(true);
    expect(evidence.rows.some((r) => r.highlight && r.label === labels[57])).toBe(true);
  });

  it("laat bij twee kolommen die op elkaar lijken allebei de reeksen zien", () => {
    const labels = weekLabels(8);
    const tv = [1, 2, 3, 4, 5, 6, 7, 8];
    const prijs = [2, 4, 6, 8, 10, 12, 14, 16];
    const { findings } = analyseProfile(
      profile({
        labels,
        n_rows: 8,
        columns: [
          column("omzet"),
          column("tv", { series: tv, min: 1, max: 8 }),
          column("prijs", { series: prijs, min: 2, max: 16 }),
        ],
        high_correlations: [{ a: "tv", b: "prijs", r: 0.99 }],
      }),
      MAPPING,
    );
    const evidence = findings.find((f) => f.kind === "duplicate")!.evidence!;
    expect(evidence.series.map((s) => s.name)).toEqual(["tv", "prijs"]);
    expect(evidence.facts.some((f) => f.includes("7 van de 7"))).toBe(true);
  });

  it("blijft een vraag stellen als het profiel de reeks niet draagt", () => {
    // Een profiel van vóór deze uitbreiding, of een bestand dat te lang is voor de reeks. Dan
    // vervalt de grafiek — niet de vraag, en niet de feiten die zonder reeks al vaststaan.
    const { findings } = analyseProfile(
      profile({
        columns: [
          column("omzet", { outliers: [{ label: "2025-11-28", value: 9999, z: 4 }] }),
          column("tv"),
          column("prijs", { longest_missing_run: 4, n_missing: 4 }),
        ],
      }),
      MAPPING,
    );
    expect(findings.length).toBe(2);
    for (const finding of findings) {
      expect(finding.evidence!.labels).toEqual([]);
      expect(finding.evidence!.series).toEqual([]);
      expect(finding.evidence!.facts.length).toBeGreaterThan(0);
    }
  });

  it("zegt bij elke keuze of hij de data verandert", () => {
    // Zodat de kaart kan tellen hoeveel van de antwoorden doorwerken. "Laat staan" verandert
    // per definitie niets; alles wat een fill, een dummy of een weggelaten kolom oplevert wel.
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
    for (const finding of findings) {
      for (const choice of finding.choices) {
        expect(typeof choice.changesData, `${finding.id}/${choice.id}`).toBe("boolean");
      }
      expect(finding.choices.find((c) => c.id === "keep")?.changesData ?? false).toBe(false);
    }
  });

  it("vraagt bij een bijzondere week wát er speelde", () => {
    // Kunnen zeggen dát er iets was zonder te kunnen zeggen wát, is de helft van een antwoord:
    // de week wordt apart gezet en niemand weet later nog waarom.
    const { findings } = analyseProfile(
      profile({
        columns: [column("omzet", { outliers: [{ label: "2025-11-28", value: 9999, z: 4 }] }), column("tv")],
      }),
      MAPPING,
    );
    const event = findings[0].choices.find((c) => c.id === "event")!;
    expect(event.note).toBeDefined();
    expect(event.note!.label.length).toBeGreaterThan(5);
  });
});

describe("wat er van de keuzes in het gesprek terechtkomt", () => {
  const { findings } = analyseProfile(
    profile({
      columns: [
        column("omzet", { outliers: [{ label: "2025-11-28", value: 9999, z: 4 }] }),
        column("tv"),
        column("prijs", { longest_missing_run: 4 }),
      ],
    }),
    MAPPING,
  );

  it("noemt alleen de antwoorden die de data veranderen, met de reden erbij", () => {
    const lines = describeChoices(
      findings,
      { "outlier:omzet:2025-11-28": "event", "gap:prijs": "keep" },
      { "outlier:omzet:2025-11-28": "Black Friday" },
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("2025-11-28");
    expect(lines[0]).toContain("Black Friday");
  });

  it("valt terug op de standaardkeuze voor een vraag die niet is beantwoord", () => {
    // De gat-vraag staat standaard op doortrekken; dat verandert de data, dus het hoort in
    // het gesprek te staan ook als de gebruiker de knop niet heeft aangeraakt.
    const lines = describeChoices(findings, {}, {});
    expect(lines.some((l) => l.includes("prijs"))).toBe(true);
  });
});

describe("de toelichting bij een bijzondere week", () => {
  it("wordt de naam van de kolom, en blijft als tekst bij het recept staan", () => {
    const { recipe } = buildRecipe(
      SOURCE,
      MAPPING,
      { "outlier:omzet:2025-11-28": "event" },
      { "outlier:omzet:2025-11-28": "Black Friday-actie" },
    );
    expect(recipe!.event_dummies![0].name).toBe("black_friday_actie_2025_48");
    expect(recipe!.event_dummies![0].note).toBe("Black Friday-actie");
  });

  it("heet naar zijn week als er niets is ingevuld", () => {
    const { recipe } = buildRecipe(SOURCE, MAPPING, { "outlier:omzet:2025-11-28": "event" }, {});
    expect(recipe!.event_dummies![0].name).toBe("bijzondere_week_2025_48");
  });

  it("bewaart beide redenen als twee pieken in dezelfde week vallen", () => {
    const { recipe } = buildRecipe(
      SOURCE,
      MAPPING,
      { "outlier:omzet:2025-11-25": "event", "outlier:omzet:2025-11-28": "event" },
      { "outlier:omzet:2025-11-25": "storing", "outlier:omzet:2025-11-28": "Black Friday" },
    );
    expect(recipe!.event_dummies).toHaveLength(1);
    expect(recipe!.event_dummies![0].note).toContain("storing");
    expect(recipe!.event_dummies![0].note).toContain("Black Friday");
  });

  it("botst nooit met een bestaande kolomnaam", () => {
    // Een dummy die een bestaande kolom overschrijft, laat mmm_core.ingestion terecht
    // struikelen (`event_dummy_name_collision`) — twee minuten later, in de worker.
    const mapping: ColumnMapping = {
      ...MAPPING,
      columns: [
        ...MAPPING.columns,
        { name: "black_friday_2025_48", role: "control", meaning: "", unit: null, confidence: "hoog" },
      ],
    };
    const { recipe } = buildRecipe(
      SOURCE,
      mapping,
      { "outlier:omzet:2025-11-28": "event" },
      { "outlier:omzet:2025-11-28": "Black Friday" },
    );
    expect(recipe!.event_dummies![0].name).toBe("black_friday_2025_48_2");
  });

  it("maakt van rare invoer een saaie kolomnaam, of geen", () => {
    expect(slug("Black Friday-actie!")).toBe("black_friday_actie");
    expect(slug("Feestdagen (kerst)")).toBe("feestdagen_kerst");
    expect(slug("!!!")).toBe("");
    expect(slug("één twee")).toBe("een_twee");
  });
});
