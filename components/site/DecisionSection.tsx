"use client";

import { useMemo, useState } from "react";
import { CHANNELS, SCENARIO, TOTAL_BUDGET, estimateScenario, shiftedSpend } from "@/lib/site/exampleData";
import { euroShort, nl, signedPct } from "@/lib/site/format";
import { Reveal } from "./motion";
import { Container, ExampleTag, Label, Section, SectionHead } from "./primitives";

/**
 * Hoofdstuk 5 — het commerciële hart. De waarde van een analyse zit niet in het model, maar in
 * de beslissing die je ermee kunt nemen. Hier zet de bezoeker zelf twee budgetverdelingen
 * naast elkaar en ziet wat het model van dat verschil verwacht: een bereik, geen belofte.
 */
export function DecisionSection() {
  const [shift, setShift] = useState(SCENARIO.initial);
  const alternative = useMemo(() => shiftedSpend(shift), [shift]);
  const estimate = useMemo(() => estimateScenario(shift), [shift]);
  const moved = (TOTAL_BUDGET * shift) / 100;

  return (
    <Section id="beslissing" wash labelledBy="beslissing-titel">
      <Container>
        <Reveal>
          <SectionHead
            id="beslissing-titel"
            watermark="Beslissing"
            label="Hoofdstuk 04 · van inzicht naar keuze"
            title="Moet je volgende euro"
            accent="naar hetzelfde kanaal?"
          />
        </Reveal>

        <div className="mt-10 grid gap-x-16 gap-y-6 lg:grid-cols-2">
          <Reveal delay={60}>
            <div className="space-y-5 text-[1.0625rem] leading-relaxed text-site-muted">
              <p>
                Je hoeft niet alleen te weten wat er de afgelopen jaren is gebeurd. Je wilt weten wat
                dat betekent voor je volgende mediaplan. Stel dat je € 7,5 miljoen te verdelen hebt,
                en de analyse laat zien dat de verhouding tussen budget en geschatte bijdrage niet
                overal hetzelfde is.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="space-y-5 text-[1.0625rem] leading-relaxed text-site-muted">
              <p>
                Dan ontstaat een interessantere vraag dan &ldquo;wat heeft het gedaan?&rdquo;. Met
                scenario-analyse zet je verschillende budgetverdelingen naast elkaar. Het doel is
                niet dat het model zegt dat je € 900.000 moet verplaatsen — het doel is dat je twee
                keuzes onderbouwd met elkaar kunt vergelijken.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={160}>
          <div className="u-card u-card-md mt-14 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-site-line px-5 py-4 sm:px-7">
              <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="site-pulse h-1.5 w-1.5 rounded-full bg-site-violet" />
                <Label tone="muted">Twee budgetverdelingen naast elkaar</Label>
              </span>
              <ExampleTag />
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="px-5 py-6 sm:px-7">
                {/* Kolomkoppen. */}
                <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-baseline gap-3 border-b border-site-line pb-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem] sm:gap-4">
                  <span className="u-label-sm u-label text-site-muted-2">Kanaal</span>
                  <span className="u-label-sm u-label text-right text-site-muted-2">Huidig</span>
                  <span className="u-label-sm u-label text-right text-site-violet">Alternatief</span>
                </div>

                <ul className="divide-y divide-site-line">
                  {CHANNELS.map((channel, i) => (
                    <AllocationRow key={channel.key} index={i} next={alternative[i]} />
                  ))}
                </ul>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-site-line pt-5">
                  <span className="u-label text-site-muted-2">Totaal ongewijzigd</span>
                  <span className="tnum font-mono text-[0.875rem] font-semibold text-site-ink">
                    {euroShort(TOTAL_BUDGET)}
                  </span>
                </div>
              </div>

              {/* De bediening en wat het model van het verschil verwacht. */}
              <div className="border-t border-site-line bg-site-paper-2/70 px-5 py-6 sm:px-7 lg:border-l lg:border-t-0">
                <Label tone="muted">Verschoven budget</Label>
                <p className="mt-3 flex flex-wrap items-baseline gap-2.5">
                  <span className="tnum text-[2.6rem] font-extrabold leading-none tracking-[-0.045em] text-site-ink">
                    {euroShort(moved)}
                  </span>
                  <span className="text-[0.875rem] text-site-muted">= {nl(shift)}% van het budget</span>
                </p>

                <div className="mt-5">
                  <label htmlFor="scenario-shift" className="sr-only">
                    Deel van het mediabudget dat verschuift van {SCENARIO.fromLabel} naar {SCENARIO.toLabel}
                  </label>
                  <input
                    id="scenario-shift"
                    type="range"
                    className="site-range"
                    min={SCENARIO.min}
                    max={SCENARIO.max}
                    step={SCENARIO.step}
                    value={shift}
                    onChange={(e) => setShift(Number(e.target.value))}
                    aria-valuetext={`${shift} procent verschoven`}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="u-label-sm u-label text-site-muted-2">← {SCENARIO.fromLabel}</span>
                    <span className="u-label-sm u-label text-site-violet">{SCENARIO.toLabel} →</span>
                  </div>
                </div>

                <div className="mt-8 border-t border-site-line pt-7">
                  <Label tone="muted">Geschatte verandering in resultaat</Label>
                  <p className="tnum mt-3 text-[clamp(1.8rem,3.4vw,2.4rem)] font-extrabold leading-none tracking-[-0.04em] text-site-violet">
                    {signedPct(estimate.low)}
                    <span className="px-2 text-site-muted-2">→</span>
                    {signedPct(estimate.high)}
                  </p>

                  <RangeBar low={estimate.low} mid={estimate.mid} high={estimate.high} />

                  <p className="mt-5 text-[0.875rem] leading-relaxed text-site-muted">
                    Bij een gelijkblijvend totaalbudget. Hoe verder je van de huidige verdeling af
                    gaat, hoe breder het bereik: die verdeling heeft het model nooit gezien.
                  </p>
                </div>
              </div>
            </div>

            <p className="border-t border-site-line px-5 py-4 text-[0.8125rem] text-site-muted-2 sm:px-7">
              Illustratief voorbeeld op voorbeelddata. Geen voorspelling voor jouw situatie.
            </p>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

/** Eén kanaalregel: huidige besteding, alternatieve besteding, en het verschil in beeld. */
function AllocationRow({ index, next }: { index: number; next: number }) {
  const channel = CHANNELS[index];
  const delta = next - channel.spend;
  const domain = 3_000_000;

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_7rem_7rem] sm:gap-4">
      <span className="min-w-0">
        <span className="block truncate text-[0.875rem] font-semibold text-site-ink">{channel.label}</span>
        <span className="mt-2 block space-y-1">
          <span className="block h-1.5 rounded-full bg-site-paper-3">
            <span className="block h-1.5 rounded-full bg-[#9E9EA6]" style={{ width: `${(channel.spend / domain) * 100}%` }} />
          </span>
          <span className="block h-1.5 rounded-full bg-site-paper-3">
            <span className="site-bar-live block h-1.5 rounded-full bg-site-violet" style={{ width: `${(next / domain) * 100}%` }} />
          </span>
        </span>
      </span>

      <span className="tnum text-right font-mono text-[0.8125rem] text-site-muted">{euroShort(channel.spend)}</span>

      <span className="text-right">
        <span className="tnum block font-mono text-[0.8125rem] font-semibold text-site-ink">{euroShort(next)}</span>
        <span
          className={`tnum block font-mono text-[0.7rem] ${
            Math.abs(delta) < 1000 ? "text-site-muted-2" : delta > 0 ? "text-site-violet" : "text-site-muted"
          }`}
        >
          {Math.abs(delta) < 1000 ? "ongewijzigd" : `${delta > 0 ? "+" : "−"}${euroShort(Math.abs(delta))}`}
        </span>
      </span>
    </li>
  );
}

/** De bandbreedte op een as van −2% tot +6%, met de middenschatting als streep. */
function RangeBar({ low, mid, high }: { low: number; mid: number; high: number }) {
  const MIN = -2;
  const MAX = 6;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - MIN) / (MAX - MIN)) * 100));

  return (
    <div className="mt-6">
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-4 h-px bg-site-line" />
        <div className="absolute top-1 h-7 w-px bg-site-line" style={{ left: `${pos(0)}%` }} />
        <div
          className="site-bar-live absolute top-2.5 h-4 rounded-full bg-site-violet-soft"
          style={{ left: `${pos(low)}%`, width: `${pos(high) - pos(low)}%` }}
        />
        <div
          className="absolute top-2 h-5 w-[3px] rounded-full bg-site-violet transition-[left] duration-[420ms] ease-out"
          style={{ left: `${pos(mid)}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[0.62rem] text-site-muted-2">
        <span>−2%</span>
        <span>geen verandering</span>
        <span>+6%</span>
      </div>
    </div>
  );
}
