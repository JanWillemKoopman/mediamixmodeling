"use client";

import { useMemo, useState } from "react";
import {
  CHANNELS,
  EXAMPLE_PROFILE,
  SCENARIO,
  TOTAL_BUDGET,
  contributionIndex,
  estimateScenario,
  shiftedSpend,
  weeklySeries,
} from "@/lib/site/exampleData";
import { euroShort, nl, signedPct } from "@/lib/site/format";
import { useCountUp, useInView, useStepper } from "./motion";
import { CardBar, ExampleTag } from "./primitives";

/**
 * Het hero-paneel: geen marketingbeeld maar een stuk software. Drie standen die het hele
 * verhaal van de site in twintig seconden vertellen — waar het geld staat, wat het naar
 * schatting bijdraagt, en wat er gebeurt als je het anders verdeelt. De zeven kanaalregels
 * blijven in elke stand op hun plek: alleen de balken en de bedragen veranderen. Klikken op
 * een stand zet de automaat stil.
 */

const STAGES = [
  { key: "budget", tab: "Budget", title: "Waar het budget staat", caption: "Mediabestedingen per kanaal, dit jaar." },
  { key: "effect", tab: "Bijdrage", title: "Wat het naar schatting bijdraagt", caption: "Geschatte bijdrage aan de omzet, met bandbreedte." },
  { key: "scenario", tab: "Scenario", title: "Wat als je het anders verdeelt?", caption: `${SCENARIO.initial}% van ${SCENARIO.fromLabel} naar ${SCENARIO.toLabel}.` },
] as const;

/** Langste bedrag dat in een rijbalk voorkomt — de schaal van alle balken. */
const DOMAIN = 3_100_000;

export function HeroConsole() {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  const { step, setStep, setPaused } = useStepper(STAGES.length, inView, 4600);
  const [manual, setManual] = useState(false);

  const shifted = useMemo(() => shiftedSpend(SCENARIO.initial), []);
  const estimate = useMemo(() => estimateScenario(SCENARIO.initial), []);
  const budget = useCountUp(TOTAL_BUDGET / 1_000_000, inView, 1100);

  function pick(index: number) {
    setManual(true);
    setPaused(true);
    setStep(index);
  }

  return (
    <div ref={ref} className="u-card u-card-md overflow-hidden">
      <CardBar
        title="Voorbeeldanalyse · media-effect"
        right={
          <span className="u-pill u-label-sm text-site-muted-2">
            {EXAMPLE_PROFILE.weeks} weken · {EXAMPLE_PROFILE.channels} kanalen
          </span>
        }
      />

      {/* Kop van het paneel: het budget zelf, plus de drie standen als bediening. */}
      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pb-5 pt-5 sm:px-5">
        <div>
          <p className="u-label text-site-muted-2">Mediabudget per jaar</p>
          <p className="tnum mt-2 text-[clamp(2rem,4vw,2.75rem)] font-extrabold leading-none tracking-[-0.04em] text-site-ink">
            € {nl(budget, 1)} mln
          </p>
        </div>

        <div role="tablist" aria-label="Standen van de voorbeeldanalyse" className="flex gap-1 rounded-full bg-site-paper-2 p-1">
          {STAGES.map((s, i) => (
            <button
              key={s.key}
              id={`hero-tab-${i}`}
              role="tab"
              aria-selected={step === i}
              aria-controls="hero-panel"
              onClick={() => pick(i)}
              className={`rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors duration-200 ${
                step === i ? "bg-site-paper text-site-ink shadow-site-sm" : "text-site-muted hover:text-site-ink"
              }`}
            >
              {s.tab}
            </button>
          ))}
        </div>
      </div>

      <div id="hero-panel" role="tabpanel" aria-labelledby={`hero-tab-${step}`} className="border-t border-site-line px-4 py-5 sm:px-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-[0.9375rem] font-bold tracking-[-0.01em] text-site-ink">{STAGES[step].title}</h3>
          <span className="u-label-sm u-label text-site-muted-2">
            {step === 0 ? "besteding" : step === 1 ? "geschatte bijdrage" : "nieuwe besteding"}
          </span>
        </div>

        <ul className="mt-4 space-y-2.5">
          {CHANNELS.map((channel, i) => (
            <ChannelRow key={channel.key} index={i} step={step} shifted={shifted[i]} />
          ))}
        </ul>
      </div>

      {/* Slotregel: in de scenariostand de geschatte uitkomst, anders de context. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-site-line bg-site-paper-2/60 px-4 py-4 sm:px-5">
        {step === 2 ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="u-label text-site-muted-2">Geschat effect op omzet</span>
            <span className="tnum text-[1.375rem] font-extrabold leading-none tracking-[-0.03em] text-site-violet">
              {signedPct(estimate.low)} <span className="text-site-muted-2">→</span> {signedPct(estimate.high)}
            </span>
          </div>
        ) : (
          <p className="max-w-md text-[0.85rem] leading-snug text-site-muted">{STAGES[step].caption}</p>
        )}

        <div className="flex items-center gap-3">
          {!manual && (
            <span aria-hidden="true" className="hidden gap-1 sm:flex">
              {STAGES.map((s, i) => (
                <span
                  key={s.key}
                  className={`h-1 rounded-full transition-all duration-500 ${
                    step === i ? "w-5 bg-site-violet" : "w-1.5 bg-site-line"
                  }`}
                />
              ))}
            </span>
          )}
          <ExampleTag />
        </div>
      </div>
    </div>
  );
}

/** Eén kanaalregel: naam, balk, bedrag. De balk verandert per stand, de regel blijft staan. */
function ChannelRow({ index, step, shifted }: { index: number; step: number; shifted: number }) {
  const channel = CHANNELS[index];
  const value = step === 0 ? channel.spend : step === 1 ? channel.contribution : shifted;
  const delta = shifted - channel.spend;
  const width = `${Math.min((value / DOMAIN) * 100, 100)}%`;

  // Bestedingen zijn grijs, geschatte bijdrage is groen (of violet waar de bijdrage
  // achterblijft bij de besteding) — de kleur is hier het argument.
  const behind = channel.contribution < channel.spend;
  const color = step === 1 ? (behind ? "#8511D9" : "#2E9E50") : "#8A8A92";

  return (
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_7rem] sm:gap-4">
      <span className="truncate text-[0.8125rem] font-medium text-site-ink sm:text-[0.875rem]">{channel.label}</span>

      <span className="relative block h-2 rounded-full bg-site-paper-3">
        {/* Bandbreedte van de schatting: alleen zichtbaar in de bijdragestand. */}
        <span
          className="absolute top-0 h-2 rounded-full bg-site-green-soft transition-opacity duration-500"
          style={{
            left: `${(channel.low / DOMAIN) * 100}%`,
            width: `${((channel.high - channel.low) / DOMAIN) * 100}%`,
            opacity: step === 1 ? 1 : 0,
          }}
        />
        <span
          className="site-bar-live absolute left-0 top-0 h-2 rounded-full"
          style={{ width, backgroundColor: color, transition: "width 700ms cubic-bezier(0.22,1,0.36,1), background-color 500ms ease" }}
        />
      </span>

      <span className="flex flex-col items-end leading-tight">
        <span className="tnum font-mono text-[0.78rem] font-semibold text-site-ink">{euroShort(value)}</span>
        <span className="tnum font-mono text-[0.66rem] text-site-muted-2">
          {step === 0
            ? `${nl(spendPct(channel.spend), 0)}%`
            : step === 1
              ? `${nl(contributionIndex(channel), 2)}×`
              : `${delta > 0 ? "+" : ""}${euroShort(Math.abs(delta) < 1000 ? 0 : delta)}`}
        </span>
      </span>
    </li>
  );
}

function spendPct(spend: number): number {
  return (spend / TOTAL_BUDGET) * 100;
}

/** Kleine reeks onder de hero-kolom: het resultaat en het deel dat met media samenhangt. */
export function HeroSpark() {
  const series = useMemo(() => weeklySeries(72), []);
  const W = 320;
  const H = 64;
  const max = Math.max(...series.map((p) => p.result)) * 1.05;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - (v / max) * H;
  const path = (get: (p: (typeof series)[number]) => number) =>
    series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(get(p)).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="h-16 w-full">
      <path d={path((p) => p.result)} fill="none" stroke="#C0C0C6" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
      <path
        d={path((p) => p.media)}
        fill="none"
        stroke="#2E9E50"
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
        className="site-draw"
        style={{ ["--len" as string]: "1400" }}
      />
    </svg>
  );
}
