import { describe, it, expect } from "vitest";
import { recommendedActions } from "@/lib/dashboardInsights";
import type { ChannelResult, FitSummary, Interval, KpiType } from "@/lib/types";

const iv = (p50: number, p3 = p50 * 0.7, p97 = p50 * 1.3): Interval => ({ p3, p50, p97 });

function channel(name: string, roasP50: number, spend: number): ChannelResult {
  return {
    name,
    absolute_contribution: iv(1_000),
    contribution_share: iv(0.05),
    roas: iv(roasP50, roasP50 * 0.6, roasP50 * 1.4),
    adstock_half_life_weeks: iv(2),
    saturation_point: iv(10_000),
    total_spend: spend,
    unit: "currency",
  };
}

function summary(kpi_type: KpiType, channels: ChannelResult[]): FitSummary {
  return {
    kpi: "flatscreen_verkopen",
    kpi_type,
    n_weeks: 201,
    window: ["2023-02-27", "2026-12-28"],
    baseline_contribution: iv(2_000_000),
    channels,
    diagnostics: {
      max_r_hat: 1.0, min_ess_bulk: 900, min_ess_tail: 850, n_divergences: 0,
      min_e_bfmi: 0.9, n_max_treedepth: 0, r2: 0.9, mape: 0.04,
      interval_coverage_94: 0.94, interval_coverage_80: 0.8, interval_coverage_50: 0.5,
      residual_autocorrelation: 0.05, decomposition_ok: true,
    },
    draws: 1000, chains: 4, validation: null, identifiability: [],
  };
}

describe("de ROAS-drempel kent zijn eenheid", () => {
  // Het MediaMarkt-geval: ROAS is hier verkopen per euro, niet omzet per euro. Tv op 0,0159
  // is bij €658 per toestel €10,45 omzet per euro — het tegenovergestelde van verliesgevend.
  const countChannels = [
    channel("tv_spend", 0.0159, 8_952_002),
    channel("search_brand_spend", 0.0565, 2_616_210),
    channel("radio_spend", 0.0541, 2_596_843),
  ];

  it("velt geen oordeel over een aantallen-KPI zonder marge", () => {
    const actions = recommendedActions(summary("orders", countChannels));
    expect(actions.filter((a) => a.kind === "cut")).toHaveLength(0);
  });

  it("velt dat oordeel wél zodra de marge bekend is", () => {
    // Marge €0,02 per verkoop → break-even ROAS 50: dan liggen ze er echt onder.
    const actions = recommendedActions(summary("orders", countChannels), 0.02);
    const cut = actions.find((a) => a.kind === "cut");
    expect(cut).toBeDefined();
    expect(cut!.detail).toContain("break-even van 50");
  });

  it("laat een marge zien waarbij de kanalen juist rendabel zijn", () => {
    // €658 marge per verkoop → break-even ROAS 0,0015; alle drie liggen daarboven.
    const actions = recommendedActions(summary("orders", countChannels), 658);
    expect(actions.filter((a) => a.kind === "cut")).toHaveLength(0);
  });

  it("houdt 1,0 aan bij een KPI in euro's", () => {
    const actions = recommendedActions(summary("revenue", [channel("tv_spend", 0.4, 100_000)]));
    expect(actions.find((a) => a.kind === "cut")).toBeDefined();
  });
});

describe("adviezen spreken elkaar niet tegen", () => {
  it("zet geen 'verlaag' op een kanaal waar de herverdeling geld heen schuift", () => {
    const base = summary("revenue", [
      channel("tv_spend", 0.4, 100_000),
      channel("email_verzendingen", 0.2, 100_000),
    ]);
    const withPlan: FitSummary = {
      ...base,
      response_curves: [
        { name: "tv_spend", current_weekly_spend: 44_537, points: [], marginal_roas_at_current: iv(0.5) },
        { name: "email_verzendingen", current_weekly_spend: 197_960, points: [], marginal_roas_at_current: iv(0.01) },
      ] as FitSummary["response_curves"],
      optimal_allocation: {
        per_channel: { tv_spend: 126_975, email_verzendingen: 79_497 },
        total_weekly_budget: 206_472,
        predicted_contribution: iv(6_177),
        fixed_channels: [],
        capped_channels: [],
      } as FitSummary["optimal_allocation"],
    };
    const cut = recommendedActions(withPlan).find((a) => a.kind === "cut");
    // tv gaat omhoog in het plan, dus mag niet in hetzelfde paneel "afbouwen" krijgen.
    expect(cut?.text ?? "").not.toContain("tv_spend");
  });
});
