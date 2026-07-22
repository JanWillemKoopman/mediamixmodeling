"use client";

import { ResultsCharts } from "@/components/ResultsCharts";
import { MMM_GLOSSARY, Term } from "@/components/ui";
import { useWizardChatOptional } from "@/components/WizardChatContext";
import {
  CONFIDENCE_LABEL,
  confidenceFromInterval,
  layeredTrustVerdict,
  moneyKpis,
  recommendedActions,
  type Confidence,
  type RecommendedAction,
  type TrustLevel,
  type TrustVerdict,
} from "@/lib/dashboardInsights";
import type {
  FitSummary,
  FrontierPoint,
  Interval,
  OptimalAllocation,
  ResponseCurve,
} from "@/lib/types";

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("nl-NL", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function pct(n: number): string {
  return (n * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 }) + "%";
}

// A value with its credible interval — uncertainty is never hidden.
function IntervalCell({ value, render }: { value: Interval; render: (n: number) => string }) {
  return (
    <div>
      <div className="font-medium text-fg">{render(value.p50)}</div>
      <div className="text-xs text-fg-faint">
        {render(value.p3)} – {render(value.p97)}
      </div>
    </div>
  );
}

// De kop-conclusie: de bottom-line in één of twee zinnen, in geldtaal — het eerste dat een
// media manager leest. Geen jargon, geen statistiek: wat dreef marketing, hoe efficiënt,
// en (met marge) wat het netto opleverde.
function Headline({
  summary,
  kpiMargin,
  isCountKpi,
}: {
  summary: FitSummary;
  kpiMargin?: number | null;
  isCountKpi?: boolean;
}) {
  // null op het klant-dashboard — de klant kan de marge niet zelf invullen, dus de tip
  // hieronder is alleen zinvol (en zichtbaar) voor de bouwer.
  const chat = useWizardChatOptional();
  const m = moneyKpis(summary, kpiMargin);
  const roasWord = isCountKpi === false ? "omzet per bestede euro" : `${summary.kpi} per bestede euro`;
  return (
    <div className="rounded-xl bg-accent-dim p-4">
      <p className="text-[15px] leading-relaxed text-fg">
        In de periode <span className="font-semibold">{summary.window[0]}</span> t/m{" "}
        <span className="font-semibold">{summary.window[1]}</span> dreef marketing naar schatting{" "}
        <span className="font-semibold">{fmt(m.marketing.p50)}</span> {summary.kpi}
        {m.baselineSharePct != null && (
          <>
            {" "}
            — de overige{" "}
            <span className="font-semibold">{fmt(m.baselineSharePct)}%</span> was er ook zonder campagnes geweest
            (de basislijn)
          </>
        )}
        .{" "}
        {m.blendedRoas != null && (
          <>
            Elke bestede euro leverde gemiddeld <span className="font-semibold">{fmt(m.blendedRoas, 2)}</span>{" "}
            {roasWord} op
            {m.roiPct != null && (
              <>
                , een netto rendement van{" "}
                <span className={`font-semibold ${m.roiPct >= 0 ? "text-success" : "text-danger"}`}>
                  {fmt(m.roiPct)}%
                </span>
              </>
            )}
            .
          </>
        )}
      </p>
      {m.roiPct == null && chat && (
        <p className="mt-1.5 text-xs text-fg-muted">
          Vul de gemiddelde marge per {summary.kpi} in bij de zakelijke context om hier het netto rendement (ROI) in
          euro&apos;s te zien.
        </p>
      )}
    </div>
  );
}

const TRUST_TONE: Record<TrustLevel, string> = {
  goed: "border-success/30 bg-success-dim text-success",
  let_op: "border-warn/30 bg-warn-dim text-warn",
  zwak: "border-danger/30 bg-danger-dim text-danger",
};

// Eén laag van het twee-laags validatieoordeel (blueprint stap 7): sampler-betrouwbaarheid
// (is het wel goed gesampled?) apart van modelfit & plausibiliteit (is de uitkomst
// inhoudelijk goed?) — elk met een eigen "terug naar stap X"-knop, want de remedie
// verschilt: een slechte sampler-diagnostiek los je op in tuning, een
// slechte inhoudelijke fit los je op in data-inspectie/-voorbereiding.
function TrustLayer({
  title,
  verdict,
  metrics,
  explanation,
  backLabel,
  onGoBack,
}: {
  title: string;
  verdict: TrustVerdict;
  metrics: React.ReactNode;
  explanation: string;
  backLabel: string;
  onGoBack?: () => void;
}) {
  const dot = verdict.level === "goed" ? "bg-success" : verdict.level === "let_op" ? "bg-warn" : "bg-danger";
  return (
    <div className={`rounded-lg border p-3 ${TRUST_TONE[verdict.level]}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className={`h-2.5 w-2.5 flex-none rounded-full ${dot}`} />
        <span>
          {title}: {verdict.headline}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {verdict.reasons.length > 0 && (
          <ul className="space-y-1 text-sm">
            {verdict.reasons.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{metrics}</div>
        <p className="text-xs opacity-80">{explanation}</p>
        {onGoBack && verdict.level !== "goed" && (
          <button
            onClick={onGoBack}
            className="rounded-lg border border-current/40 bg-surface px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
          >
            {backLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// De twee-laags diagnostiek (sampler-betrouwbaarheid + modelfit) — de bouwersweergave, met
// per laag een gerichte "terug"-knop (naar tuning bij een sampler-probleem, naar
// inspectie/data-voorbereiding bij een inhoudelijk plausibiliteitsprobleem) via de
// WizardChatContext-navigatie. `onGoBack` ontbreekt op het klantdashboard (chat == null),
// waar deze laag-voor-laag weergave sowieso alleen achter "Details" verschijnt (zie
// TrustBadge hieronder) — de klant heeft niets aan sampler-jargon of een terug-knop naar een
// wizardstap die hij niet kan openen.
function TrustLayers({ summary }: { summary: FitSummary }) {
  const { sampler, fit } = layeredTrustVerdict(summary);
  const d = summary.diagnostics;
  return (
    <div className="space-y-3">
      <TrustLayer
        title="Laag 1 — Sampler-betrouwbaarheid"
        verdict={sampler}
        explanation="Is het model wel goed gesampled? R-hat rond 1.0, een hoge effectieve steekproef (ESS) en weinig/geen divergenties betekenen: de MCMC-sampler heeft de posterior betrouwbaar verkend."
        backLabel="Terug naar tuning"
        metrics={
          <>
            <DiagMetric label={<Term definition={MMM_GLOSSARY.rhat}>Max R-hat</Term>} value={fmt(d.max_r_hat, 2)} />
            <DiagMetric label="Min ESS" value={fmt(d.min_ess_bulk, 0)} />
            <DiagMetric label="Divergenties" value={fmt(d.n_divergences, 0)} />
          </>
        }
      />
      <TrustLayer
        title="Laag 2 — Modelfit & plausibiliteit"
        verdict={fit}
        explanation="Is de uitkomst inhoudelijk goed? R² en MAPE zeggen hoe goed het model de historie volgt; dekking en de decompositie of de opbouw en onzekerheidsmarges kloppen."
        backLabel="Terug naar data-inspectie/-voorbereiding"
        metrics={
          <>
            <DiagMetric label={<Term definition={MMM_GLOSSARY.r2}>R²</Term>} value={fmt(d.r2, 2)} />
            <DiagMetric label={<Term definition={MMM_GLOSSARY.mape}>MAPE</Term>} value={pct(d.mape)} />
            <DiagMetric
              label={<Term definition={MMM_GLOSSARY.coverage}>Dekking (94%)</Term>}
              value={pct(d.interval_coverage_94)}
            />
          </>
        }
      />
    </div>
  );
}

const OVERALL_HEADLINE: Record<TrustLevel, string> = {
  goed: "Betrouwbaar genoeg om op te vertrouwen",
  let_op: "Bruikbaar, met een paar kanttekeningen",
  zwak: "Wees voorzichtig met grote besluiten op basis van dit model",
};

// Vertrouwensoordeel. In de bouwerswizard (chat != null) de volledige twee-laags diagnostiek
// met terugnavigatie — de bouwer moet weten of hij naar tuning of naar data terug moet. Op
// het klantdashboard (chat == null) telt vooral "kan ik dit vertrouwen": één helder oordeel,
// met dezelfde diagnostiek (mét credible intervals — die verdwijnen nergens) toegankelijk
// achter "Details" voor wie het wil narekenen.
function TrustBadge({ summary }: { summary: FitSummary }) {
  const chat = useWizardChatOptional(); // null op het klant-dashboard
  if (chat) {
    const { sampler, fit } = layeredTrustVerdict(summary);
    return (
      <div className="space-y-3">
        <TrustLayer
          title="Laag 1 — Sampler-betrouwbaarheid"
          verdict={sampler}
          explanation="Is het model wel goed gesampled? R-hat rond 1.0, een hoge effectieve steekproef (ESS) en weinig/geen divergenties betekenen: de MCMC-sampler heeft de posterior betrouwbaar verkend."
          backLabel="Terug naar tuning"
          onGoBack={() => chat.goToPhase("tuning", "sampler-diagnostiek niet goed genoeg")}
          metrics={
            <>
              <DiagMetric label={<Term definition={MMM_GLOSSARY.rhat}>Max R-hat</Term>} value={fmt(summary.diagnostics.max_r_hat, 2)} />
              <DiagMetric label="Min ESS" value={fmt(summary.diagnostics.min_ess_bulk, 0)} />
              <DiagMetric label="Divergenties" value={fmt(summary.diagnostics.n_divergences, 0)} />
            </>
          }
        />
        <TrustLayer
          title="Laag 2 — Modelfit & plausibiliteit"
          verdict={fit}
          explanation="Is de uitkomst inhoudelijk goed? R² en MAPE zeggen hoe goed het model de historie volgt; dekking en de decompositie of de opbouw en onzekerheidsmarges kloppen."
          backLabel="Terug naar data-inspectie/-voorbereiding"
          onGoBack={() => chat.goToPhase("inspect", "modelfit/plausibiliteit niet goed genoeg")}
          metrics={
            <>
              <DiagMetric label={<Term definition={MMM_GLOSSARY.r2}>R²</Term>} value={fmt(summary.diagnostics.r2, 2)} />
              <DiagMetric label={<Term definition={MMM_GLOSSARY.mape}>MAPE</Term>} value={pct(summary.diagnostics.mape)} />
              <DiagMetric
                label={<Term definition={MMM_GLOSSARY.coverage}>Dekking (94%)</Term>}
                value={pct(summary.diagnostics.interval_coverage_94)}
              />
            </>
          }
        />
      </div>
    );
  }

  const { overall } = layeredTrustVerdict(summary);
  const dot = overall === "goed" ? "bg-success" : overall === "let_op" ? "bg-warn" : "bg-danger";
  return (
    <div className={`rounded-lg border p-3 ${TRUST_TONE[overall]}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className={`h-2.5 w-2.5 flex-none rounded-full ${dot}`} />
        <span>Modelvertrouwen: {OVERALL_HEADLINE[overall]}</span>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer select-none text-xs opacity-80">Details (met bandbreedtes en diagnostiek)</summary>
        <div className="mt-2">
          <TrustLayers summary={summary} />
        </div>
      </details>
    </div>
  );
}

function DiagMetric({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

const ACTION_ICON: Record<RecommendedAction["kind"], string> = {
  shift: "⇄",
  scale: "↑",
  cut: "↓",
  hold: "✓",
};

// Het "doe dit"-blok: concrete, geprioriteerde budgetadviezen afgeleid uit de optimizer,
// de frontier en de ROAS-verdeling — met per advies een vertrouwenslabel. Dit is wat het
// dashboard van "mooie grafieken" naar "besluitvormingsinstrument" tilt.
function ActionsBlock({ summary, kpiMargin }: { summary: FitSummary; kpiMargin?: number | null }) {
  const actions = recommendedActions(summary, kpiMargin);
  if (actions.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-fg">Aanbevolen acties</h3>
      <div className="space-y-2">
        {actions.map((a, i) => (
          <div key={i} className="flex gap-3 rounded-lg border border-border bg-surface-2/60 p-3">
            <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent text-sm text-white">
              {ACTION_ICON[a.kind]}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">{a.text}</p>
              <p className="mt-0.5 text-xs text-fg-muted">{a.detail}</p>
              <span className="mt-1.5 inline-block">
                <ConfidencePill confidence={a.confidence} />
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-fg-faint">
        Adviezen zijn richtinggevend en gebaseerd op de modelverwachting bij de huidige data. Toets grote
        verschuivingen met een test voordat je ze volledig doorvoert.
      </p>
    </div>
  );
}

const CONFIDENCE_TONE: Record<Confidence, string> = {
  hoog: "bg-success-dim text-success",
  midden: "bg-warn-dim text-warn",
  laag: "bg-surface-2 text-fg-muted",
};

export function ConfidencePill({ confidence }: { confidence: Confidence }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CONFIDENCE_TONE[confidence]}`}>
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}

// "Same weekly budget, better split" — the optimizer's suggested reallocation, next to
// what each channel currently gets and what the next euro returns there.
// One honest sentence about whether spending more in total is worth it, read off the
// efficiency frontier: compare the optimal contribution at the current total vs +50%.
function frontierInsight(frontier: FrontierPoint[] | undefined, current: number, kpi: string) {
  if (!frontier || frontier.length < 2) return null;
  const sorted = [...frontier].sort((a, b) => a.total_weekly_budget - b.total_weekly_budget);
  const nearest = (target: number) =>
    sorted.reduce((best, p) =>
      Math.abs(p.total_weekly_budget - target) < Math.abs(best.total_weekly_budget - target) ? p : best,
    );
  const base = nearest(current);
  const more = nearest(current * 1.5);
  if (more.total_weekly_budget <= base.total_weekly_budget * 1.01) return null;
  const extraSpend = more.total_weekly_budget - base.total_weekly_budget;
  const extraKpi = more.predicted_contribution.p50 - base.predicted_contribution.p50;
  return (
    <p className="text-sm text-fg-muted">
      Ongeveer <span className="font-medium">{fmt(extraSpend)}</span> meer budget per week levert naar
      schatting <span className="font-medium">{fmt(extraKpi)}</span> extra {kpi} per week op — daarna
      vlakt het rendement af (zie de onzekerheidsmarges).
    </p>
  );
}

function BudgetAdvice({
  allocation,
  curves,
  frontier,
  kpi,
}: {
  allocation: OptimalAllocation;
  curves: ResponseCurve[];
  frontier?: FrontierPoint[];
  kpi: string;
}) {
  const byName = new Map(curves.map((c) => [c.name, c]));
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-fg">Budgetadvies</h3>
        <p className="text-sm text-fg-muted">
          Bij hetzelfde totale weekbudget van{" "}
          <span className="font-medium">{fmt(allocation.total_weekly_budget)}</span> haalt deze
          verdeling naar schatting{" "}
          <span className="font-medium">{fmt(allocation.predicted_contribution.p50)}</span> {kpi} per
          week uit marketing ({fmt(allocation.predicted_contribution.p3)} –{" "}
          {fmt(allocation.predicted_contribution.p97)}).
        </p>
      </div>
      <details>
        <summary className="cursor-pointer select-none text-xs font-medium text-fg-muted">
          Cijfers per kanaal (tabel)
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-faint">
                <th className="py-2 pr-4 font-medium">Kanaal</th>
                <th className="py-2 pr-4 font-medium">Nu per week</th>
                <th className="py-2 pr-4 font-medium">Advies per week</th>
                <th className="py-2 pr-4 font-medium">Rendement volgende euro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Object.entries(allocation.per_channel).map(([name, advised]) => {
                const curve = byName.get(name);
                const current = curve?.current_weekly_spend ?? 0;
                const up = advised > current * 1.01;
                const down = advised < current * 0.99;
                return (
                  <tr key={name}>
                    <td className="py-3 pr-4 font-medium text-fg">{name}</td>
                    <td className="py-3 pr-4 text-fg-muted">{fmt(current)}</td>
                    <td className="py-3 pr-4">
                      <span className="font-medium text-fg">{fmt(advised)}</span>{" "}
                      {up && <span className="text-xs text-accent">↑</span>}
                      {down && <span className="text-xs text-fg-faint">↓</span>}
                    </td>
                    <td className="py-3 pr-4">
                      {curve ? (
                        <IntervalCell value={curve.marginal_roas_at_current} render={(n) => fmt(n, 2)} />
                      ) : (
                        <span className="text-fg-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      {frontierInsight(frontier, allocation.total_weekly_budget, kpi)}
    </div>
  );
}

export function SummaryView({
  summary,
  kpiMargin,
  isCountKpi,
}: {
  summary: FitSummary;
  kpiMargin?: number | null;
  // Telling-KPI (orders/leads) vs. continue KPI (omzet) — bepaalt de marge-woordkeuze
  // in de grafieken ("per verkochte eenheid" vs. "per euro omzet"). Onbekend = neutraal.
  isCountKpi?: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* Hero: conclusie → vertrouwen → actie (business vóór statistiek). */}
      <Headline summary={summary} kpiMargin={kpiMargin} isCountKpi={isCountKpi} />
      <TrustBadge summary={summary} />
      <ActionsBlock summary={summary} kpiMargin={kpiMargin} />

      <ResultsCharts summary={summary} kpiMargin={kpiMargin} isCountKpi={isCountKpi} />

      <details className="border-t border-border pt-4">
        <summary className="cursor-pointer select-none text-sm font-medium text-fg">
          Cijfers per kanaal (tabel)
        </summary>
        <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-faint">
              <th className="py-2 pr-4 font-medium">Kanaal</th>
              <th className="py-2 pr-4 font-medium">Aandeel</th>
              <th className="py-2 pr-4 font-medium">
                <Term definition={MMM_GLOSSARY.roas}>ROAS</Term>
              </th>
              <th className="py-2 pr-4 font-medium">
                <Term definition={MMM_GLOSSARY.adstock}>Doorwerking</Term>
              </th>
              <th className="py-2 pr-4 font-medium">
                <Term definition={MMM_GLOSSARY.saturation}>Verzadiging vanaf</Term>
              </th>
              <th className="py-2 pr-4 font-medium">
                <Term definition="Welk deel van de opbrengst in dezelfde week viel als de uitgave (direct); de rest is na-ijl — doorwerking in latere weken.">
                  Direct
                </Term>
              </th>
              <th className="py-2 pr-4 font-medium">
                <Term definition="Hoe zeker het model is over dit kanaal — afgeleid van de breedte van de onzekerheidsband. Laag vertrouwen betekent meestal: te weinig of te weinig variërende data om dit kanaal scherp te schatten.">
                  Vertrouwen
                </Term>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {summary.channels.map((ch) => (
              <tr key={ch.name}>
                <td className="py-3 pr-4 font-medium text-fg">{ch.name}</td>
                <td className="py-3 pr-4">
                  <IntervalCell value={ch.contribution_share} render={pct} />
                </td>
                <td className="py-3 pr-4">
                  <IntervalCell value={ch.roas} render={(n) => fmt(n, 2)} />
                </td>
                <td className="py-3 pr-4">
                  <IntervalCell value={ch.adstock_half_life_weeks} render={(n) => fmt(n, 1) + " wk"} />
                </td>
                <td className="py-3 pr-4">
                  <IntervalCell value={ch.saturation_point} render={(n) => fmt(n)} />
                </td>
                <td className="py-3 pr-4">
                  {ch.direct_share ? <IntervalCell value={ch.direct_share} render={pct} /> : <span className="text-fg-faint">—</span>}
                </td>
                <td className="py-3 pr-4">
                  <ConfidencePill confidence={confidenceFromInterval(ch.roas)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </details>

      {summary.optimal_allocation && summary.response_curves && summary.response_curves.length > 0 && (
        <BudgetAdvice
          allocation={summary.optimal_allocation}
          curves={summary.response_curves}
          frontier={summary.efficiency_frontier}
          kpi={summary.kpi}
        />
      )}
    </div>
  );
}
