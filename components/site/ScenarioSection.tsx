"use client";

import { useMemo, useState } from "react";
import {
  CHANNELS,
  EFFECT_STEPS_INK,
  SCENARIO,
  SPEND_STEPS_INK,
  TOTAL_BUDGET,
  estimateScenario,
  shiftedSpendShares,
} from "@/lib/site/exampleData";
import { euroShort, nl, signedPct } from "@/lib/site/format";
import { Reveal, useInView } from "./motion";
import { Container, ExampleTag, PanelLabel, Section, SectionHead } from "./primitives";

/**
 * Sectie 04 — de kernvraag van elke budgetverantwoordelijke, en de enige sectie waarin de
 * bezoeker zelf aan het model draait. Verschuif budget van kanalen die bestaande vraag
 * opvangen naar kanalen die vraag creëren, en zie wat dat naar schatting doet: als bereik,
 * dat breder wordt naarmate je verder van je huidige verdeling af gaat.
 */
export function ScenarioSection() {
  const [shift, setShift] = useState(SCENARIO.initial);
  const { ref, inView } = useInView<HTMLDivElement>(0.15);

  const shares = useMemo(() => shiftedSpendShares(shift), [shift]);
  const estimate = useMemo(() => estimateScenario(shift), [shift]);

  return (
    <Section id="scenario" tone="ink" labelledBy="scenario-titel" className="overflow-hidden">
      <div aria-hidden="true" className="site-grid-ink absolute inset-0 opacity-60" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(31,90,255,0.20),transparent_70%)]"
      />

      <Container wide className="relative">
        <Reveal>
          <SectionHead
            id="scenario-titel"
            eyebrow="Scenario"
            ink
            title="Wat gebeurt er met je resultaat als je je mediabudget verandert?"
            intro="Dit is de vraag waar het mediaplan op vastloopt. Niet omdat er te weinig cijfers zijn, maar omdat geen enkele rapportage hem beantwoordt. Verschuif hieronder budget en zie wat de analyse ervan verwacht."
          />
        </Reveal>

        <Reveal delay={100}>
          <div
            ref={ref}
            className="mt-12 overflow-hidden rounded-panel border border-site-line-ink bg-site-ink-2/80 shadow-site-ink backdrop-blur sm:mt-16"
          >
            <div className="flex items-center justify-between gap-3 border-b border-site-line-ink px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2.5">
                <span aria-hidden="true" className="site-pulse h-1.5 w-1.5 rounded-full bg-site-blue-ink" />
                <PanelLabel ink>Scenario-simulator</PanelLabel>
              </div>
              <ExampleTag ink>Voorbeelddata</ExampleTag>
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              {/* ── Verdeling: huidig versus nieuw, per kanaal ────────────────────── */}
              <div className="px-4 py-6 sm:px-6 sm:py-8">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-white">
                    Budgetverdeling
                  </h3>
                  <div className="flex items-center gap-4">
                    <Legend color="#8C95A6" label="huidig" />
                    <Legend color="#7FA6FF" label="nieuw" />
                  </div>
                </div>

                <ul className="mt-5 space-y-3.5">
                  {CHANNELS.map((channel, i) => (
                    <AllocationRow key={channel.key} index={i} newShare={shares[i]} />
                  ))}
                </ul>

                <div className="mt-7 rounded-card border border-site-line-ink bg-white/[0.03] px-4 py-4">
                  <PanelLabel ink>Waarom deze richting?</PanelLabel>
                  <p className="mt-2.5 text-[0.875rem] leading-relaxed text-site-on-ink-muted">
                    Shopping en merk-search vangen vooral vraag op die er al is. TV en radio creëren
                    vraag die er nog niet was. Het model schat wat die ruil doet met je totale
                    resultaat — inclusief het risico dat het effect uitblijft.
                  </p>
                </div>
              </div>

              {/* ── Bediening en uitkomst ────────────────────────────────────────── */}
              <div className="border-t border-site-line-ink bg-black/20 px-4 py-6 sm:px-6 sm:py-8 lg:border-l lg:border-t-0">
                <PanelLabel ink>Verschuif budget</PanelLabel>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="tnum font-display text-[3rem] font-semibold leading-none tracking-[-0.04em] text-white">
                    {nl(shift)}%
                  </span>
                  <span className="text-[0.875rem] text-site-on-ink-muted">van het totale budget</span>
                </div>

                <div className="mt-5">
                  <label htmlFor="scenario-shift" className="sr-only">
                    Percentage van het mediabudget dat verschuift van {SCENARIO.fromLabel} naar{" "}
                    {SCENARIO.toLabel}
                  </label>
                  <input
                    id="scenario-shift"
                    type="range"
                    className="site-range site-range--ink"
                    min={SCENARIO.min}
                    max={SCENARIO.max}
                    step={SCENARIO.step}
                    value={shift}
                    onChange={(e) => setShift(Number(e.target.value))}
                    aria-valuetext={`${shift} procent verschoven`}
                  />
                  <div className="flex items-center justify-between gap-3 font-mono text-[11px] text-site-on-ink-faint">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true">←</span> {SCENARIO.fromLabel}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {SCENARIO.toLabel} <span aria-hidden="true">→</span>
                    </span>
                  </div>
                </div>

                <div className="mt-7 border-t border-site-line-ink pt-6">
                  <PanelLabel ink>Geschat effect op omzet</PanelLabel>
                  <p className="tnum mt-3 font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-none tracking-[-0.03em] text-site-blue-ink">
                    {signedPct(estimate.low)}
                    <span className="px-2 text-site-on-ink-faint">→</span>
                    {signedPct(estimate.high)}
                  </p>

                  <UncertaintyBar low={estimate.low} mid={estimate.mid} high={estimate.high} />

                  <p className="mt-4 text-[0.875rem] leading-relaxed text-site-on-ink-muted">
                    Bij een gelijkblijvend totaalbudget. Hoe verder je van de huidige verdeling af
                    gaat, hoe breder het bereik: het model heeft die situatie nooit gezien.
                  </p>
                </div>

                <ShiftSummary shift={shift} />
              </div>
            </div>

            <p className="border-t border-site-line-ink px-4 py-4 text-[0.8125rem] text-site-on-ink-faint sm:px-5">
              Illustratief scenario op voorbeelddata. Geen voorspelling voor jouw situatie.
            </p>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-site-on-ink-faint">
      <span aria-hidden="true" className="h-1.5 w-3 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/** Twee balken onder elkaar: waar het budget nu staat, en waar het naartoe zou gaan. */
function AllocationRow({ index, newShare }: { index: number; newShare: number }) {
  const channel = CHANNELS[index];
  const delta = newShare - channel.spendShare;
  const domain = 40;

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-2.5">
          <span className="text-[0.875rem] text-site-on-ink">{channel.label}</span>
          <span className="tnum font-mono text-[11px] text-site-on-ink-faint">{nl(newShare, 1)}%</span>
        </span>
        <span className="flex items-baseline gap-3">
          <span className="tnum font-mono text-[0.8125rem] text-white">
            {euroShort((TOTAL_BUDGET * newShare) / 100)}
          </span>
          <span
            className={`tnum w-16 text-right font-mono text-[11px] ${
              Math.abs(delta) < 0.05
                ? "text-site-on-ink-faint"
                : delta > 0
                  ? "text-site-blue-ink"
                  : "text-site-on-ink-muted"
            }`}
          >
            {Math.abs(delta) < 0.05 ? "—" : `${delta > 0 ? "+" : ""}${nl(delta, 1)} pt`}
          </span>
        </span>
      </div>

      <div className="mt-2 space-y-1">
        <div className="h-1.5 w-full rounded-full bg-white/[0.07]">
          <div
            className="h-1.5 rounded-full"
            style={{ width: `${(channel.spendShare / domain) * 100}%`, backgroundColor: SPEND_STEPS_INK[2] }}
          />
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/[0.07]">
          <div
            className="site-bar-live h-1.5 rounded-full"
            style={{ width: `${(newShare / domain) * 100}%`, backgroundColor: EFFECT_STEPS_INK[index] }}
          />
        </div>
      </div>
    </li>
  );
}

/** De bandbreedte op een as van −2% tot +6%, met de middenschatting als streep. */
function UncertaintyBar({ low, mid, high }: { low: number; mid: number; high: number }) {
  const MIN = -2;
  const MAX = 6;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - MIN) / (MAX - MIN)) * 100));

  return (
    <div className="mt-5">
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-4 h-px bg-white/15" />
        <div className="absolute top-1 h-7 w-px bg-white/25" style={{ left: `${pos(0)}%` }} />
        <div
          className="site-bar-live absolute top-2.5 h-4 rounded-full bg-site-blue-ink/25"
          style={{ left: `${pos(low)}%`, width: `${pos(high) - pos(low)}%` }}
        />
        <div
          className="absolute top-2 h-5 w-[3px] rounded-full bg-site-blue-ink transition-[left] duration-[420ms] ease-out"
          style={{ left: `${pos(mid)}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-site-on-ink-faint">
        <span>−2%</span>
        <span>geen effect</span>
        <span>+6%</span>
      </div>
    </div>
  );
}

/** Wat de verschuiving in euro's betekent — het getal waar een directie op reageert. */
function ShiftSummary({ shift }: { shift: number }) {
  return (
    <dl className="mt-7 grid grid-cols-2 gap-4 border-t border-site-line-ink pt-6">
      <div>
        <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-site-on-ink-faint">
          Verschoven bedrag
        </dt>
        <dd className="tnum mt-1.5 font-display text-xl font-semibold text-white">
          {euroShort((TOTAL_BUDGET * shift) / 100)}
        </dd>
      </div>
      <div>
        <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-site-on-ink-faint">
          Totaalbudget
        </dt>
        <dd className="tnum mt-1.5 font-display text-xl font-semibold text-white">{euroShort(TOTAL_BUDGET)}</dd>
      </div>
    </dl>
  );
}
