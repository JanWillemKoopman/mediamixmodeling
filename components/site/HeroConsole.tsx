"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CHANNELS,
  EFFECT_STEPS,
  EXAMPLE_PROFILE,
  SCENARIO,
  SPEND_STEPS,
  TOTAL_BUDGET,
  channelSpend,
  estimateScenario,
  shiftedSpendShares,
} from "@/lib/site/exampleData";
import { euroShort, nl, signedPct } from "@/lib/site/format";
import { useCountUp, useInView, useStepper } from "./motion";
import { ExampleTag, PanelLabel } from "./primitives";

/**
 * Het hero-paneel: geen marketingbeeld maar een stuk software. Drie standen die het hele
 * verhaal van de site in twintig seconden vertellen — waar het geld staat, wat het naar
 * schatting bijdraagt, en wat er gebeurt als je het anders verdeelt. De bezoeker kan zelf
 * op een stand klikken; dan stopt de automaat.
 *
 * De vijf kanaalregels blijven in alle standen op hun plek staan: alleen de balken
 * veranderen. Dat is precies het argument — hetzelfde budget, een ander beeld.
 */

const STEPS = [
  {
    key: "budget",
    tab: "Mediabudget",
    title: "Waar het budget staat",
    caption: "Verdeling van het jaarlijkse mediabudget over de kanalen.",
  },
  {
    key: "effect",
    tab: "Media-effect",
    title: "Wat het naar schatting bijdraagt",
    caption: "Geschat aandeel in de door media verklaarde omzet, met bandbreedte.",
  },
  {
    key: "scenario",
    tab: "Scenario",
    title: "Wat als je het anders verdeelt?",
    caption: `Verschuif ${SCENARIO.initial}% van ${SCENARIO.fromLabel} naar ${SCENARIO.toLabel}.`,
  },
] as const;

/** Schaal van de rijbalken: 40% is de langste waarde die voorkomt. */
const DOMAIN = 40;

export function HeroConsole() {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const { step, setStep, setPaused } = useStepper(STEPS.length, inView, 4200);
  const [manual, setManual] = useState(false);

  const shifted = useMemo(() => shiftedSpendShares(SCENARIO.initial), []);
  const estimate = useMemo(() => estimateScenario(SCENARIO.initial), []);

  const budget = useCountUp(TOTAL_BUDGET / 1_000_000, inView, 1200);

  function pick(index: number) {
    setManual(true);
    setPaused(true);
    setStep(index);
  }

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-panel border border-site-line bg-white shadow-site-panel"
    >
      {/* Titelbalk: identiteit van het paneel, de drie standen, en de omvang van de dataset. */}
      <div className="flex flex-col gap-3 border-b border-site-line bg-white/80 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="site-pulse h-1.5 w-1.5 rounded-full bg-site-blue" />
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-site-text-muted">
            Voorbeeldanalyse
          </span>
          <span aria-hidden="true" className="hidden h-3 w-px bg-site-line-strong sm:block" />
          <span className="hidden font-mono text-[11px] text-site-text-faint sm:inline">
            {EXAMPLE_PROFILE.historyLabel} · {EXAMPLE_PROFILE.channelsLabel}
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Standen van de voorbeeldanalyse"
          className="flex items-center gap-1 rounded-ctl bg-site-surface-2 p-1"
        >
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              id={`hero-tab-${i}`}
              role="tab"
              aria-selected={step === i}
              aria-controls="hero-console-panel"
              onClick={() => pick(i)}
              className={`relative flex-1 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[0.8125rem] transition-colors duration-200 sm:flex-none ${
                step === i
                  ? "bg-white text-site-text shadow-[0_1px_2px_rgba(11,16,32,0.10)]"
                  : "text-site-text-muted hover:text-site-text"
              }`}
            >
              {s.tab}
            </button>
          ))}
        </div>
      </div>

      <div
        id="hero-console-panel"
        role="tabpanel"
        aria-labelledby={`hero-tab-${step}`}
        className="grid lg:grid-cols-[minmax(0,1fr)_17rem]"
      >
        {/* ── Hoofdvlak: stapelbalk + kanaalregels ───────────────────────────────── */}
        <div className="site-grid-light px-4 py-5 sm:px-6 sm:py-7">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-site-text">
              {STEPS[step].title}
            </h3>
            <PanelLabel>
              {step === 0 ? "aandeel budget" : step === 1 ? "aandeel effect" : "nieuwe verdeling"}
            </PanelLabel>
          </div>

          <StackedBar step={step} shifted={shifted} />

          <ul className="mt-5 space-y-px">
            {CHANNELS.map((channel, i) => (
              <ChannelRow key={channel.key} index={i} step={step} shifted={shifted[i]} />
            ))}
          </ul>
        </div>

        {/* ── Zijkolom: de cijfers die bij de huidige stand horen ─────────────────── */}
        <div className="border-t border-site-line bg-site-surface-2/60 px-4 py-5 sm:px-6 lg:border-l lg:border-t-0">
          {step < 2 ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-1">
              <Metric
                label="Mediabudget per jaar"
                value={`€ ${nl(budget, 1)} mln`}
                sub={`${EXAMPLE_PROFILE.channelsLabel}, ${EXAMPLE_PROFILE.channelsSub}`}
              />
              <Metric
                label="Historie"
                value={EXAMPLE_PROFILE.historyLabel}
                sub={EXAMPLE_PROFILE.historySub}
              />
              <Metric
                label={step === 0 ? "Rapportages" : "Meegewogen factoren"}
                value={step === 0 ? "7 systemen" : EXAMPLE_PROFILE.variablesLabel}
                sub={step === 0 ? "elk met een eigen maatstaf" : EXAMPLE_PROFILE.variablesSub}
              />
            </dl>
          ) : (
            <ScenarioReadout estimate={estimate} active={inView} />
          )}
        </div>
      </div>

      {/* Statusregel: wat je nu ziet, plus de voortgang van de reeks. */}
      <div className="flex items-center justify-between gap-4 border-t border-site-line px-4 py-3 sm:px-5">
        <p className="text-[0.8125rem] leading-snug text-site-text-muted">{STEPS[step].caption}</p>
        <div className="flex shrink-0 items-center gap-3">
          {!manual && (
            <span aria-hidden="true" className="hidden gap-1 sm:flex">
              {STEPS.map((s, i) => (
                <span
                  key={s.key}
                  className={`h-1 rounded-full transition-all duration-500 ${
                    step === i ? "w-5 bg-site-blue" : "w-1.5 bg-site-line-strong"
                  }`}
                />
              ))}
            </span>
          )}
          <ExampleTag>Voorbeelddata</ExampleTag>
        </div>
      </div>
    </div>
  );
}

/** De 100%-balk: dezelfde vijf kanalen, maar in elke stand een andere samenstelling. */
function StackedBar({ step, shifted }: { step: number; shifted: number[] }) {
  const values = CHANNELS.map((c, i) =>
    step === 0 ? c.spendShare : step === 1 ? c.effectShare : shifted[i],
  );
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div className="mt-4">
      <div className="flex h-12 w-full gap-[2px] overflow-hidden rounded-[8px]">
        {CHANNELS.map((channel, i) => {
          const share = (values[i] / total) * 100;
          const color = step === 1 ? EFFECT_STEPS[i] : SPEND_STEPS[i];
          const light = i < (step === 1 ? 3 : 2);
          return (
            <div
              key={channel.key}
              className="site-bar-live flex min-w-0 items-center justify-center overflow-hidden first:rounded-l-[8px] last:rounded-r-[8px]"
              style={{ width: `${share}%`, backgroundColor: color, transition: "width 700ms cubic-bezier(0.22,1,0.36,1), background-color 500ms ease" }}
              title={`${channel.label} — ${nl(values[i], 0)}%`}
            >
              <span
                className={`truncate px-1 font-mono text-[10px] tracking-tight ${
                  light ? "text-white/85" : "text-site-text/70"
                }`}
              >
                {nl(values[i], 0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Eén kanaalregel. Blijft in elke stand op dezelfde plek; alleen de balk verandert. */
function ChannelRow({ index, step, shifted }: { index: number; step: number; shifted: number }) {
  const channel = CHANNELS[index];
  const value = step === 0 ? channel.spendShare : step === 1 ? channel.effectShare : shifted;
  const delta = shifted - channel.spendShare;

  const width = `${Math.min((value / DOMAIN) * 100, 100)}%`;
  const bandLeft = `${(channel.effectLow / DOMAIN) * 100}%`;
  const bandWidth = `${((channel.effectHigh - channel.effectLow) / DOMAIN) * 100}%`;
  const color = step === 1 ? EFFECT_STEPS[index] : SPEND_STEPS[index];

  const values = (
    <>
      <span className="tnum font-mono text-[0.8125rem] text-site-text">{nl(value, step === 2 ? 1 : 0)}%</span>
      <span className="tnum truncate font-mono text-[11px] text-site-text-faint">
        {step === 0
          ? euroShort(channelSpend(channel))
          : step === 1
            ? `${nl(channel.effectLow)}–${nl(channel.effectHigh)}%`
            : `${delta > 0 ? "+" : ""}${nl(delta, 1)} pt`}
      </span>
    </>
  );

  return (
    <li className="rounded-[8px] px-1.5 py-2.5 transition-colors hover:bg-white/70 sm:grid sm:grid-cols-[8.5rem_minmax(0,1fr)_7.5rem] sm:items-center sm:gap-4 sm:py-2">
      {/* Smal scherm: naam en waarden op één regel, balk eronder. Breed: alles naast elkaar. */}
      <div className="flex items-baseline justify-between gap-3 sm:hidden">
        <span className="truncate text-[0.875rem] text-site-text">{channel.label}</span>
        <span className="flex shrink-0 items-baseline gap-2.5">{values}</span>
      </div>
      <span className="hidden truncate text-[0.875rem] text-site-text sm:block">{channel.label}</span>

      <div className="relative mt-2.5 h-2.5 sm:mt-0">
        <div className="absolute inset-0 rounded-full bg-site-surface-3" />
        {/* Bandbreedte: alleen zichtbaar in de effectstand — een schatting hoort een marge te hebben. */}
        <div
          className="absolute top-0 h-2.5 rounded-full bg-site-blue/20 transition-opacity duration-500"
          style={{ left: bandLeft, width: bandWidth, opacity: step === 1 ? 1 : 0 }}
        />
        <div
          className="site-bar-live absolute left-0 top-0 h-2.5 rounded-full"
          style={{ width, backgroundColor: color, transition: "width 700ms cubic-bezier(0.22,1,0.36,1), background-color 500ms ease" }}
        />
      </div>

      <div className="hidden items-baseline justify-end gap-2.5 sm:flex">{values}</div>
    </li>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-site-text-faint">{label}</dt>
      <dd className="mt-1.5 tnum font-display text-2xl font-semibold tracking-[-0.02em] text-site-text">{value}</dd>
      <dd className="mt-1 text-[0.8125rem] leading-snug text-site-text-muted">{sub}</dd>
    </div>
  );
}

/** De uitkomst van de scenariostand: een bereik, nadrukkelijk geen enkel getal. */
function ScenarioReadout({
  estimate,
  active,
}: {
  estimate: { low: number; mid: number; high: number };
  active: boolean;
}) {
  const low = useCountUp(estimate.low, active, 900);
  const high = useCountUp(estimate.high, active, 1100);

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-site-text-faint">
        Geschat effect op omzet
      </p>
      <p className="mt-2 tnum font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-site-blue">
        {signedPct(low)} <span className="text-site-text-faint">→</span> {signedPct(high)}
      </p>
      <p className="mt-2 text-[0.8125rem] leading-snug text-site-text-muted">
        Bij een gelijkblijvend totaalbudget. De mogelijkheid dat het effect klein blijft, zit in het
        bereik.
      </p>

      <RangeBar low={estimate.low} mid={estimate.mid} high={estimate.high} active={active} />

      <p className="mt-3 text-[11px] leading-snug text-site-text-faint">
        Illustratief scenario. Geen voorspelling voor jouw situatie.
      </p>
    </div>
  );
}

/** Bereikbalkje: −2% tot +6% als as, met de bandbreedte en de middenschatting erop. */
function RangeBar({ low, mid, high, active }: { low: number; mid: number; high: number; active: boolean }) {
  const MIN = -2;
  const MAX = 6;
  const pos = (v: number) => ((v - MIN) / (MAX - MIN)) * 100;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (active) {
      const id = window.setTimeout(() => setReady(true), 120);
      return () => window.clearTimeout(id);
    }
  }, [active]);

  return (
    <div className="mt-5">
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-3.5 h-px bg-site-line-strong" />
        {/* Nul-lijn: waar "geen effect" ligt. */}
        <div className="absolute top-1 h-6 w-px bg-site-line-strong" style={{ left: `${pos(0)}%` }} />
        <div
          className="absolute top-2 h-4 rounded-full bg-site-blue/20 transition-all duration-700 ease-out"
          style={{ left: `${pos(low)}%`, width: ready ? `${pos(high) - pos(low)}%` : 0 }}
        />
        <div
          className="absolute top-1.5 h-5 w-[3px] rounded-full bg-site-blue transition-opacity duration-500"
          style={{ left: `${pos(mid)}%`, opacity: ready ? 1 : 0 }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-site-text-faint">
        <span>−2%</span>
        <span>0</span>
        <span>+6%</span>
      </div>
    </div>
  );
}
