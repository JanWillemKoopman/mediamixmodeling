"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FitSummary, Interval, ResponseCurve } from "@/lib/types";

// De scenario-planner: de klant stelt zélf een toekomstige mediamix samen door per kanaal
// de weekspend te plussen of te minnen (met een percentage-schuif óf een exact bedrag), en
// leest direct af wat het model verwacht dat dit doet met het aantal KPI's én de kosten —
// afgezet tegen "niets aanpassen". Volledig deterministisch: elke uitkomst wordt
// geïnterpoleerd uit de al berekende responscurves (bijdrage per kanaal bij een gegeven
// weekspend), dus geen extra rekengang of AI-aanroep nodig.

const ACCENT = "#00693E";
const NEUTRAL = "#97A09B";
const GRID = "rgba(0,0,0,0.07)";
const AXIS = { fontSize: 11, fill: "#5C6660" };

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("nl-NL", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${fmt(n / 1_000_000, 1)}M`;
  if (Math.abs(n) >= 1_000) return `${fmt(n / 1_000, 1)}k`;
  return fmt(n);
}

function fmtSigned(n: number, digits = 0): string {
  const s = fmt(Math.abs(n), digits);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

// Lineaire interpolatie van de responscurve: bij een gekozen weekspend de bijbehorende
// (mediaan + 94%-band) bijdrage aflezen. Buiten het waargenomen bereik wordt niet
// doorgetrokken maar afgekapt op het laatste punt (vlak), en `outside` gezet zodat de UI
// eerlijk kan waarschuwen dat dit voorbij de historische ervaring ligt.
interface CurveRead {
  contribution: Interval;
  outside: boolean;
}
function readCurve(curve: ResponseCurve, spend: number): CurveRead {
  const pts = [...curve.points].sort((a, b) => a.weekly_spend - b.weekly_spend);
  if (pts.length === 0) {
    const zero = { p3: 0, p50: 0, p97: 0 };
    return { contribution: zero, outside: false };
  }
  const lo = pts[0];
  const hi = pts[pts.length - 1];
  if (spend <= lo.weekly_spend) return { contribution: lo.contribution, outside: spend < lo.weekly_spend - 1e-6 };
  if (spend >= hi.weekly_spend) return { contribution: hi.contribution, outside: spend > hi.weekly_spend + 1e-6 };
  let i = pts.findIndex((p) => p.weekly_spend >= spend);
  if (i <= 0) i = 1;
  const a = pts[i - 1];
  const b = pts[i];
  const t = (spend - a.weekly_spend) / (b.weekly_spend - a.weekly_spend || 1);
  const mix = (pick: (iv: Interval) => number) => pick(a.contribution) + t * (pick(b.contribution) - pick(a.contribution));
  return {
    contribution: { p3: mix((iv) => iv.p3), p50: mix((iv) => iv.p50), p97: mix((iv) => iv.p97) },
    outside: false,
  };
}

interface Horizon {
  label: string;
  weeks: number;
}
const HORIZONS: Horizon[] = [
  { label: "1 week", weeks: 1 },
  { label: "4 weken", weeks: 4 },
  { label: "Kwartaal (13 wk)", weeks: 13 },
  { label: "Jaar (52 wk)", weeks: 52 },
];

// De maximale spend die de schuif per kanaal toelaat: ruim boven zowel het huidige
// spendniveau als het bereik van de curve, zodat er ook echt "plus" ruimte is — maar we
// markeren wat buiten het waargenomen bereik valt.
function sliderMax(curve: ResponseCurve): number {
  const curveMax = curve.points.reduce((m, p) => Math.max(m, p.weekly_spend), 0);
  const base = curve.current_weekly_spend;
  return Math.max(curveMax, base * 3, base + 1000, 1000);
}

// De optimale (best mogelijke) marketingbijdrage bij een gegeven totaalbudget, afgelezen
// van de al berekende efficiency frontier — dat is: ditzelfde budget optimaal over de
// kanalen verdeeld. Zo kunnen we het handmatige scenario eerlijk afzetten tegen "wat had
// het model met deze euro's gehaald bij de beste verdeling?". Buiten het frontier-bereik
// afgekapt (geen extrapolatie). Retourneert null als er geen bruikbare frontier is.
function optimalAtBudget(summary: FitSummary, budget: number): number | null {
  const fr = [...(summary.efficiency_frontier ?? [])].sort((a, b) => a.total_weekly_budget - b.total_weekly_budget);
  if (fr.length < 2) return null;
  const min = fr[0].total_weekly_budget;
  const max = fr[fr.length - 1].total_weekly_budget;
  const x = Math.min(max, Math.max(min, budget));
  let i = fr.findIndex((f) => f.total_weekly_budget >= x);
  if (i <= 0) i = 1;
  const a = fr[i - 1];
  const b = fr[i];
  const t = (x - a.total_weekly_budget) / (b.total_weekly_budget - a.total_weekly_budget || 1);
  return a.predicted_contribution.p50 + t * (b.predicted_contribution.p50 - a.predicted_contribution.p50);
}

// Een bewaard scenario voor de vergelijkingstabel.
interface SavedScenario {
  id: number;
  label: string;
  weekSpend: number;
  weekKpi: number;
}

export function ScenarioPlanner({ summary, kpiMargin }: { summary: FitSummary; kpiMargin?: number | null }) {
  const curves = summary.response_curves ?? [];
  // Basis (weekbedragen): huidige spend per kanaal + de niet-marketing basislijn per week.
  const baselineWeekly = summary.n_weeks > 0 ? summary.baseline_contribution.p50 / summary.n_weeks : 0;

  // Bron van waarheid: de gekozen weekspend per kanaal (absoluut). Zowel de %-schuif als het
  // €-invoerveld schrijven hiernaartoe, zodat beide altijd consistent blijven.
  const [spendByChannel, setSpendByChannel] = useState<Record<string, number>>(() =>
    Object.fromEntries(curves.map((c) => [c.name, c.current_weekly_spend])),
  );
  const [horizonWeeks, setHorizonWeeks] = useState<number>(13);
  const [saved, setSaved] = useState<SavedScenario[]>([]);

  const rows = useMemo(() => {
    return curves.map((curve) => {
      const base = curve.current_weekly_spend;
      const chosen = spendByChannel[curve.name] ?? base;
      const baseRead = readCurve(curve, base);
      const scenarioRead = readCurve(curve, chosen);
      const pct = base > 0 ? (chosen / base - 1) * 100 : null;
      return {
        name: curve.name,
        base,
        chosen,
        pct,
        max: sliderMax(curve),
        baseContribution: baseRead.contribution.p50,
        scenarioContribution: scenarioRead.contribution.p50,
        outside: scenarioRead.outside,
      };
    });
  }, [curves, spendByChannel]);

  const totals = useMemo(() => {
    const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + pick(r), 0);
    const baseSpend = sum((r) => r.base);
    const scenarioSpend = sum((r) => r.chosen);
    const baseMarketing = sum((r) => r.baseContribution);
    const scenarioMarketing = sum((r) => r.scenarioContribution);
    const baseKpi = baselineWeekly + baseMarketing;
    const scenarioKpi = baselineWeekly + scenarioMarketing;
    return { baseSpend, scenarioSpend, baseMarketing, scenarioMarketing, baseKpi, scenarioKpi };
  }, [rows, baselineWeekly]);

  if (curves.length === 0) return null;

  const changed = rows.some((r) => Math.abs(r.chosen - r.base) > 0.5);
  const setSpend = (name: string, value: number) =>
    setSpendByChannel((prev) => ({ ...prev, [name]: Math.max(0, value) }));
  const reset = () => setSpendByChannel(Object.fromEntries(curves.map((c) => [c.name, c.current_weekly_spend])));

  const anyOutside = rows.some((r) => r.outside);

  // Horizonprojectie: weekbedragen × aantal weken.
  const h = horizonWeeks;
  const spendDeltaWeek = totals.scenarioSpend - totals.baseSpend;
  const kpiDeltaWeek = totals.scenarioKpi - totals.baseKpi;
  const spendDeltaHorizon = spendDeltaWeek * h;
  const kpiDeltaHorizon = kpiDeltaWeek * h;
  // Netto effect als de marge bekend is: extra KPI × marge − extra kosten (over de horizon).
  const netHorizon = kpiMargin != null ? kpiDeltaHorizon * kpiMargin - spendDeltaHorizon : null;

  // Reconciliatie met de optimizer: wat had ditzelfde scenariobudget opgeleverd bij de
  // optimale verdeling? Zo weet de gebruiker of zijn handmatige mix nog ruimte laat liggen.
  const optimalMarketing = optimalAtBudget(summary, totals.scenarioSpend);
  const optimalGap = optimalMarketing != null ? optimalMarketing - totals.scenarioMarketing : null;
  const leavingOnTable = optimalGap != null && optimalGap > Math.max(1, totals.scenarioMarketing * 0.02);

  const compareData = rows.map((r) => ({
    name: r.name,
    nu: Math.max(0, r.baseContribution),
    scenario: Math.max(0, r.scenarioContribution),
  }));

  const saveScenario = () =>
    setSaved((prev) => [
      ...prev,
      {
        id: Date.now(),
        label: `Scenario ${prev.length + 1}`,
        weekSpend: totals.scenarioSpend,
        weekKpi: totals.scenarioKpi,
      },
    ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-fg">Stel zelf een toekomstscenario samen</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Plus of min de weekspend per kanaal — met de schuif (%) of door een exact bedrag in te typen — en
          lees direct af wat het model verwacht dat er met je {summary.kpi} en je kosten gebeurt, vergeleken met
          niets aanpassen. De uitkomsten volgen de verzadigingscurve per kanaal: meer geld levert niet overal
          evenveel extra op. &ldquo;Nu&rdquo; is hier de modelverwachting bij je huidige weekspend; die kan licht
          afwijken van de historische toerekening op het tabblad Resultaten.
        </p>
      </div>

      {/* Bovenbalk: horizon + reset */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <span>Vooruitkijken over</span>
          <select
            value={horizonWeeks}
            onChange={(e) => setHorizonWeeks(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-fg focus:outline-none"
          >
            {HORIZONS.map((o) => (
              <option key={o.weeks} value={o.weeks}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {changed && (
          <button
            onClick={reset}
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-fg-muted transition hover:text-fg"
          >
            Terug naar huidige mix
          </button>
        )}
      </div>

      {/* Per-kanaal regelaars */}
      <div className="space-y-2.5">
        {rows.map((r) => {
          const deltaContribution = r.scenarioContribution - r.baseContribution;
          const up = deltaContribution > 0.5;
          const down = deltaContribution < -0.5;
          return (
            <div key={r.name} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-medium text-fg">{r.name}</p>
                <p className="text-xs text-fg-muted">
                  nu <span className="tabular-nums">{fmt(r.base)}</span> / week
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <input
                  type="range"
                  min={0}
                  max={r.max}
                  step={Math.max(1, Math.round(r.max / 200))}
                  value={Math.min(r.chosen, r.max)}
                  onChange={(e) => setSpend(r.name, Number(e.target.value))}
                  className="h-1.5 min-w-[160px] flex-1 accent-[#00693E]"
                  aria-label={`Weekspend ${r.name}`}
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-fg-faint">€</span>
                  <input
                    type="number"
                    min={0}
                    value={Math.round(r.chosen)}
                    onChange={(e) => setSpend(r.name, Number(e.target.value))}
                    className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1 text-right text-sm tabular-nums text-fg focus:outline-none focus:shadow-glow-sm"
                    aria-label={`Weekspend ${r.name} in euro`}
                  />
                  <span className="text-xs text-fg-faint">/wk</span>
                </div>
                <span
                  className={`min-w-[3.5rem] rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${
                    r.pct == null
                      ? "bg-surface-2 text-fg-faint"
                      : r.pct > 0.5
                        ? "bg-success-dim text-success"
                        : r.pct < -0.5
                          ? "bg-danger-dim text-danger"
                          : "bg-surface-2 text-fg-muted"
                  }`}
                >
                  {r.pct == null ? "—" : `${fmtSigned(r.pct, 0)}%`}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
                <span className="text-fg-muted">
                  Bijdrage: <span className="font-medium tabular-nums text-fg">{fmt(r.scenarioContribution)}</span>{" "}
                  {summary.kpi}/wk
                </span>
                {(up || down) && (
                  <span className={`font-medium tabular-nums ${up ? "text-success" : "text-danger"}`}>
                    {up ? "▲" : "▼"} {fmtSigned(deltaContribution)} t.o.v. nu
                  </span>
                )}
                {r.outside && (
                  <span className="text-fg-faint">buiten het historische bereik — voorzichtig lezen</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Uitkomst: jouw scenario vs. ongewijzigd */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ScenarioMetric
            label="Weekbudget (kosten)"
            base={totals.baseSpend}
            scenario={totals.scenarioSpend}
            unit="/ week"
            higherIsBad
          />
          <ScenarioMetric
            label={`Verwachte ${summary.kpi} per week`}
            base={totals.baseKpi}
            scenario={totals.scenarioKpi}
            unit="/ week"
            hint="inclusief basislijn (verkoop zonder marketing)"
          />
          <ScenarioMetric
            label={`Marketingbijdrage`}
            base={totals.baseMarketing}
            scenario={totals.scenarioMarketing}
            unit={`${summary.kpi}/wk`}
          />
        </div>

        {/* Horizonprojectie */}
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">
            Over {HORIZONS.find((o) => o.weeks === h)?.label ?? `${h} weken`} (t.o.v. niets aanpassen)
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] text-fg-muted">Extra kosten</p>
              <p className={`text-lg font-semibold tabular-nums ${spendDeltaHorizon > 0 ? "text-fg" : "text-success"}`}>
                {fmtSigned(spendDeltaHorizon)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-fg-muted">Extra {summary.kpi}</p>
              <p
                className={`text-lg font-semibold tabular-nums ${
                  kpiDeltaHorizon > 0.5 ? "text-success" : kpiDeltaHorizon < -0.5 ? "text-danger" : "text-fg"
                }`}
              >
                {fmtSigned(kpiDeltaHorizon)}
              </p>
            </div>
            {netHorizon != null && (
              <div>
                <p className="text-[11px] text-fg-muted">Netto resultaat (marge − kosten)</p>
                <p
                  className={`text-lg font-semibold tabular-nums ${
                    netHorizon > 0.5 ? "text-success" : netHorizon < -0.5 ? "text-danger" : "text-fg"
                  }`}
                >
                  {fmtSigned(netHorizon)}
                </p>
              </div>
            )}
          </div>
          {kpiMargin == null && (
            <p className="mt-1.5 text-[11px] text-fg-faint">
              Vul de gemiddelde marge per {summary.kpi} in (stap 3) voor een netto winst-/verliesberekening van dit
              scenario.
            </p>
          )}
          {h > 1 && (
            <p className="mt-1.5 text-[11px] text-fg-faint">
              Projectie = wekelijkse uitkomst × {h}. Seizoenspieken en -dalen worden hierin niet meegerekend; lees
              het als een gemiddelde per week over de periode.
            </p>
          )}
        </div>

        {/* Reconciliatie met de optimizer: laat ditzelfde budget nog rendement liggen? */}
        {changed && leavingOnTable && optimalGap != null && (
          <div className="mt-3 rounded-lg border border-warn/30 bg-warn-dim px-3 py-2 text-xs text-warn">
            De optimale verdeling van ditzelfde weekbudget ({fmt(totals.scenarioSpend)}) zou naar schatting{" "}
            <span className="font-semibold tabular-nums">{fmt(optimalGap)}</span> {summary.kpi} per week méér opleveren
            dan jouw verdeling. Zie het tabblad Resultaten → &ldquo;Budgetadvies&rdquo; voor de optimale mix.
          </div>
        )}
        {changed && optimalGap != null && !leavingOnTable && (
          <div className="mt-3 rounded-lg border border-success/30 bg-success-dim px-3 py-2 text-xs text-success">
            Sterke mix: je zit bij dit budget vrijwel op de optimale verdeling die het model kent.
          </div>
        )}
      </div>

      {/* Bewaar & vergelijk: zet meerdere scenario's naast elkaar voor het gesprek. */}
      <div className="rounded-lg border border-border bg-surface p-3" data-print="hide">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-fg">Scenario&apos;s vergelijken</p>
          <button
            onClick={saveScenario}
            className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white transition hover:bg-accent-hover"
          >
            + Bewaar huidig scenario
          </button>
        </div>
        {saved.length === 0 ? (
          <p className="mt-2 text-[11px] text-fg-faint">
            Bewaar een paar scenario&apos;s om ze hier — met kosten en verwachte {summary.kpi} per week — naast
            elkaar en naast de huidige mix te zien.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-faint">
                  <th className="py-1.5 pr-3 font-medium">Scenario</th>
                  <th className="py-1.5 pr-3 font-medium">Kosten/wk</th>
                  <th className="py-1.5 pr-3 font-medium">{summary.kpi}/wk</th>
                  <th className="py-1.5 pr-3 font-medium">Δ KPI vs. nu</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-3 font-medium text-fg">Huidige mix</td>
                  <td className="py-2 pr-3 tabular-nums text-fg-muted">{fmt(totals.baseSpend)}</td>
                  <td className="py-2 pr-3 tabular-nums text-fg-muted">{fmt(totals.baseKpi)}</td>
                  <td className="py-2 pr-3 tabular-nums text-fg-faint">—</td>
                  <td className="py-2" />
                </tr>
                {saved.map((s) => {
                  const d = s.weekKpi - totals.baseKpi;
                  return (
                    <tr key={s.id}>
                      <td className="py-2 pr-3 font-medium text-fg">{s.label}</td>
                      <td className="py-2 pr-3 tabular-nums text-fg">{fmt(s.weekSpend)}</td>
                      <td className="py-2 pr-3 tabular-nums text-fg">{fmt(s.weekKpi)}</td>
                      <td
                        className={`py-2 pr-3 tabular-nums font-medium ${
                          d > 0.5 ? "text-success" : d < -0.5 ? "text-danger" : "text-fg-muted"
                        }`}
                      >
                        {fmtSigned(d)}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => setSaved((prev) => prev.filter((x) => x.id !== s.id))}
                          className="text-xs text-fg-faint transition hover:text-danger"
                          aria-label={`Verwijder ${s.label}`}
                        >
                          verwijder
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vergelijkingsgrafiek: bijdrage per kanaal — nu vs. scenario */}
      {changed && (
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="mb-1.5 text-xs font-medium text-fg">Bijdrage per kanaal — nu vs. jouw scenario</p>
          <ResponsiveContainer width="100%" height={Math.max(120, compareData.length * 40)} className="overflow-hidden">
            <BarChart data={compareData} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 4 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={AXIS} tickFormatter={fmtShort} />
              <YAxis type="category" dataKey="name" tick={AXIS} width={100} />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.05)" }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)" }}
                formatter={(v, n) => [typeof v === "number" ? fmt(v) : String(v), n === "nu" ? "nu" : "scenario"]}
              />
              <Bar dataKey="nu" fill={NEUTRAL} radius={[0, 3, 3, 0]} barSize={11} name="nu" />
              <Bar dataKey="scenario" fill={ACCENT} radius={[0, 3, 3, 0]} barSize={11} name="scenario" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-1 flex items-center gap-4 text-[11px] text-fg-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: NEUTRAL }} /> nu
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ACCENT }} /> jouw scenario
            </span>
          </div>
        </div>
      )}

      {anyOutside && (
        <p className="text-[11px] text-fg-faint">
          Sommige gekozen bedragen liggen buiten het bereik dat het model in de data heeft gezien. Daar wordt niet
          doorgetrokken maar afgekapt op de laatst waargenomen opbrengst — behandel die uitkomsten als indicatief.
        </p>
      )}
    </div>
  );
}

// Eén uitkomstblok: het scenariogetal groot, met daaronder klein het "nu"-getal en het
// verschil — zo blijft de vergelijking met "niets aanpassen" altijd in beeld.
function ScenarioMetric({
  label,
  base,
  scenario,
  unit,
  hint,
  higherIsBad,
}: {
  label: string;
  base: number;
  scenario: number;
  unit?: string;
  hint?: string;
  higherIsBad?: boolean;
}) {
  const delta = scenario - base;
  const meaningful = Math.abs(delta) > 0.5;
  // Kleur van het verschil: bij kosten is méér "duur" (neutraal ink), bij KPI is méér goed.
  const deltaColor = !meaningful
    ? "text-fg-faint"
    : higherIsBad
      ? delta > 0
        ? "text-fg"
        : "text-success"
      : delta > 0
        ? "text-success"
        : "text-danger";
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-fg-faint">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-fg">
        {fmt(scenario)} {unit && <span className="text-xs font-normal text-fg-muted">{unit}</span>}
      </p>
      <p className="text-[11px] text-fg-muted">
        nu <span className="tabular-nums">{fmt(base)}</span>
        {meaningful && (
          <span className={`ml-1.5 font-medium tabular-nums ${deltaColor}`}>({fmtSigned(delta)})</span>
        )}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-fg-faint">{hint}</p>}
    </div>
  );
}
