// Stap 7: de gelaagde uitkomst, en de poort eronder.
//
// Dit is invariant §8.2.3 — geen getal zonder zijn oordeel — getoetst op de plek waar de
// getallen daadwerkelijk gerenderd worden. De poort zelf is `allows()` uit mmm-core; wat hier
// bewaakt wordt is dat de uitkomstlagen er nergens omheen lopen.
//
// De tweede helft gaat over §8.4: elk getal in de uitkomst komt uit code. Een uitkomstlaag die
// vrije tekst zou doorgeven waar een getal in staat, is niet te controleren.

import { describe, expect, it } from "vitest";
import {
  adviceFor,
  headlineFigures,
  inseparableNote,
  steerVerdict,
  strongestChannel,
} from "@/lib/flow/outcome";
import type {
  ChannelResult,
  FitSummary,
  Interval,
  ModelValidation,
  ValidationLevel,
} from "@/lib/types";

const iv = (p50: number, spread = 0.2): Interval => ({
  p3: p50 * (1 - spread),
  p50,
  p97: p50 * (1 + spread),
});

function channel(name: string, share: number, contribution: number): ChannelResult {
  return {
    name,
    absolute_contribution: iv(contribution),
    contribution_share: iv(share, 0.1),
    roas: iv(contribution / 1000),
    adstock_half_life_weeks: iv(2),
    saturation_point: iv(5000),
    total_spend: 1000,
    unit: "currency",
  };
}

const ALLOWED: Record<ValidationLevel, ModelValidation["allowed_outputs"]> = {
  not_usable: ["diagnostics"],
  technically_completed: ["diagnostics"],
  statistically_valid: ["diagnostics", "total_media_contribution", "channel_contributions", "publish"],
  usable_for_decisions: [
    "diagnostics",
    "total_media_contribution",
    "channel_contributions",
    "response_curves",
    "budget_advice",
    "publish",
  ],
};

function validation(level: ValidationLevel, over: Partial<ModelValidation> = {}): ModelValidation {
  return {
    model_run_id: "run-1",
    level,
    ruleset_version: "2024.2",
    allowed_outputs: ALLOWED[level],
    blocking_reasons: level === "not_usable" ? ["De berekening is niet stabiel geworden."] : [],
    warning_reasons: [],
    checks: [],
    per_channel: [
      { name: "tv", usable: true, reasons: [] },
      { name: "social", usable: true, reasons: [] },
    ],
    inseparable_groups: [],
    ...over,
  };
}

const SUMMARY: FitSummary = {
  kpi: "omzet",
  kpi_type: "revenue",
  n_weeks: 104,
  window: ["2024-01-01", "2025-12-29"],
  baseline_contribution: iv(400_000),
  channels: [channel("tv", 0.2, 120_000), channel("social", 0.1, 60_000)],
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
};

const LEVELS: ValidationLevel[] = [
  "not_usable",
  "technically_completed",
  "statistically_valid",
  "usable_for_decisions",
];

describe("laag 1 — kan ik hierop sturen", () => {
  it("opent met een handeling, niet met een niveaunaam", () => {
    for (const level of LEVELS) {
      const verdict = steerVerdict(validation(level));
      // De kop moet zeggen wat je kunt. "Statistisch in orde" is geen antwoord op die vraag.
      expect(verdict.headline.length, level).toBeGreaterThan(15);
      expect(verdict.headline, level).not.toContain("statistically");
      expect(verdict.headline.toLowerCase(), level).not.toContain("validatie");
      // Het technische niveau blijft beschikbaar, maar als voetnoot.
      expect(verdict.levelLabel.length, level).toBeGreaterThan(0);
    }
  });

  it("wijst bij elk tekortkomend model een uitweg aan", () => {
    // Dit is wat "nooit een doodlopende toestand" betekent op het scherm waar het het meeste
    // telt: de gebruiker heeft vijf minuten gewacht en hoort nu dat het niet goed is.
    for (const level of LEVELS) {
      const verdict = steerVerdict(validation(level));
      if (level === "usable_for_decisions") {
        expect(verdict.remedy, level).toBeNull();
      } else {
        expect(verdict.remedy, level).not.toBeNull();
        expect(verdict.remedy!.why.length, level).toBeGreaterThan(20);
      }
    }
  });

  it("stuurt een sampler-probleem naar de verwachtingen en een fit-probleem naar de data", () => {
    // De remedie verschilt per laag, en dat onderscheid is de hele reden dat het oordeel in
    // twee lagen bestaat.
    expect(steerVerdict(validation("not_usable")).remedy!.step).toBe("beliefs");
    expect(steerVerdict(validation("technically_completed")).remedy!.step).toBe("prepare");
  });

  it("zegt iets begrijpelijks als er nog geen oordeel is", () => {
    const verdict = steerVerdict(null);
    expect(verdict.tone).toBe("blocked");
    expect(verdict.explanation.length).toBeGreaterThan(20);
  });

  it("geeft de redenen door zoals de rekenkern ze formuleerde", () => {
    const verdict = steerVerdict(
      validation("statistically_valid", { warning_reasons: ["De voorspelfout is hoog in de laatste weken."] }),
    );
    expect(verdict.reasons).toContain("De voorspelfout is hoog in de laatste weken.");
  });
});

describe("laag 2 — wat is er gebeurd", () => {
  it("toont geen enkel getal bij een model dat de drempel niet haalt", () => {
    for (const level of ["not_usable", "technically_completed"] as ValidationLevel[]) {
      expect(headlineFigures(SUMMARY, validation(level)), level).toEqual([]);
      expect(strongestChannel(SUMMARY, validation(level)), level).toBeNull();
    }
  });

  it("toont de hoofdgetallen zodra het oordeel dat toestaat", () => {
    for (const level of ["statistically_valid", "usable_for_decisions"] as ValidationLevel[]) {
      const figures = headlineFigures(SUMMARY, validation(level));
      expect(figures.length, level).toBeGreaterThan(1);
      expect(figures[0].label, level).toContain("omzet");
    }
  });

  it("zet de bandbreedte bij het hoofdgetal", () => {
    // Onzekerheid verdwijnt nergens — ook niet in de samenvatting bovenaan.
    const figures = headlineFigures(SUMMARY, validation("usable_for_decisions"));
    expect(figures[0].range).toBeTruthy();
    expect(figures[0].range).toContain("–");
  });

  it("noemt het netto rendement alleen als de marge bekend is", () => {
    const zonder = headlineFigures(SUMMARY, validation("usable_for_decisions"));
    expect(zonder.some((f) => f.label.includes("rendement"))).toBe(false);
    const met = headlineFigures(SUMMARY, validation("usable_for_decisions"), 0.3);
    expect(met.some((f) => f.label.includes("rendement"))).toBe(true);
  });

  it("benoemt een brede bandbreedte bij het sterkste kanaal", () => {
    const breed = {
      ...SUMMARY,
      channels: [{ ...channel("tv", 0.2, 120_000), contribution_share: { p3: 0.02, p50: 0.2, p97: 0.5 } }],
    };
    expect(strongestChannel(breed, validation("usable_for_decisions"))!.confidence).toBe("breed");
    expect(strongestChannel(SUMMARY, validation("usable_for_decisions"))!.confidence).toBe("smal");
  });

  it("slaat een kanaal over dat volgens het oordeel niet los te beoordelen is", () => {
    const v = validation("statistically_valid", {
      per_channel: [
        { name: "tv", usable: false, reasons: ["niet te scheiden van social"] },
        { name: "social", usable: true, reasons: [] },
      ],
    });
    expect(strongestChannel(SUMMARY, v)!.name).toBe("social");
  });

  it("zegt het als kanalen alleen samen te beoordelen zijn", () => {
    const note = inseparableNote(validation("statistically_valid", { inseparable_groups: [["tv", "social"]] }));
    expect(note).toContain("tv en social");
    expect(note).toContain("totaal");
    expect(inseparableNote(validation("statistically_valid"))).toBeNull();
  });
});

describe("laag 3 — wat zou ik doen", () => {
  it("geeft geen budgetadvies zolang het oordeel dat niet toestaat", () => {
    // Geld verschuiven op basis van een model dat zijn eigen drempel niet haalt, is precies
    // wat dit product moet uitsluiten.
    for (const level of ["not_usable", "technically_completed", "statistically_valid"] as ValidationLevel[]) {
      expect(adviceFor(SUMMARY, validation(level)), level).toEqual([]);
    }
  });

  it("geeft wél advies op het hoogste niveau", () => {
    // Een advies vraagt meer dan een oordeel: de optimizer moet een verdeling hebben opgeleverd
    // en er moeten curves zijn om op af te lezen. Zonder die twee is "geen advies" het juiste
    // antwoord, en dat is ook wat er gebeurt — zie de test hieronder.
    const curve = (name: string, spend: number, top: number) => ({
      name,
      current_weekly_spend: spend,
      marginal_roas_at_current: iv(1.5),
      points: [
        { weekly_spend: 0, contribution: iv(0), extrapolated: false },
        { weekly_spend: spend, contribution: iv(top * 0.7), extrapolated: false },
        { weekly_spend: spend * 2, contribution: iv(top), extrapolated: false },
      ],
    });
    const compleet: FitSummary = {
      ...SUMMARY,
      response_curves: [curve("tv", 1000, 3000), curve("social", 1000, 1200)],
      optimal_allocation: {
        total_weekly_budget: 2000,
        // De optimizer wil geld van social naar tv schuiven.
        per_channel: { tv: 1700, social: 300 },
        predicted_contribution: iv(3000),
        capped_channels: [],
        fixed_channels: [],
      },
    };
    const advice = adviceFor(compleet, validation("usable_for_decisions"));
    expect(advice.length).toBeGreaterThan(0);
    expect(advice[0].text.length).toBeGreaterThan(10);
  });

  it("geeft geen advies als de optimizer niets heeft opgeleverd", () => {
    // Oudere runs hebben geen budgetverdeling. Dan is stilte het juiste antwoord, niet een
    // verzonnen aanbeveling.
    expect(adviceFor(SUMMARY, validation("usable_for_decisions"))).toEqual([]);
  });
});

describe("elk getal komt uit code", () => {
  it("de uitkomstlagen leveren opgemaakte waarden, geen vrije tekst met cijfers erin", () => {
    // §8.4: de gids schrijft de duiding, niet de cijfers. Deze lagen leveren daarom velden met
    // een label en een al opgemaakte waarde — niet één zin waar een getal in verstopt zit.
    const figures = headlineFigures(SUMMARY, validation("usable_for_decisions"), 0.3);
    for (const figure of figures) {
      expect(figure.label, figure.label).not.toMatch(/\d/);
      expect(figure.value.length, figure.label).toBeGreaterThan(0);
    }
  });

  it("alle getallen zijn herleidbaar tot de samenvatting", () => {
    const figures = headlineFigures(SUMMARY, validation("usable_for_decisions"));
    const marketing = SUMMARY.channels.reduce((s, c) => s + c.absolute_contribution.p50, 0);
    // Het eerste getal is de som van de kanaalbijdragen — dezelfde bron als het
    // klantdashboard gebruikt, dus dezelfde cijfers op beide plekken.
    expect(figures[0].value).toBe(marketing.toLocaleString("nl-NL", { maximumFractionDigits: 0, minimumFractionDigits: 0 }));
  });
});
