"use client";

import { CHANNELS, EXAMPLE_SCOPE, MEDIA_INPUTS, TOTAL_BUDGET } from "@/lib/site/exampleData";
import { euroShort, nl } from "@/lib/site/format";
import { Anim, useCountUp, useInView } from "./motion";
import { ExampleTag, Label } from "./primitives";

/**
 * De opening-visual: geen dashboard vol grafieken, maar de redenering van het product in één
 * rustig beeld. Van boven naar beneden: het budget, de kanalen waar het naartoe gaat, het
 * bedrijfsresultaat waar alles samenkomt, en de geschatte bijdrage die de analyse daaruit
 * afleidt. Wie vijf seconden kijkt, snapt wat het product doet.
 */
export function HeroFlow() {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  const budget = useCountUp(TOTAL_BUDGET / 1_000_000, inView, 1100);

  return (
    <div ref={ref}>
      <Anim className="u-card u-card-md overflow-hidden">
        {/* 1 — het budget. */}
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-6 sm:px-7">
          <div>
            <Label tone="muted">Mediabudget per jaar</Label>
            <p className="tnum mt-2.5 text-[clamp(2.1rem,4vw,2.9rem)] font-extrabold leading-none tracking-[-0.04em] text-site-ink">
              € {nl(budget, 1)} mln
            </p>
          </div>
          <span className="u-pill u-label-sm text-site-muted-2">
            {EXAMPLE_SCOPE.weeksLabel} · {EXAMPLE_SCOPE.years}
          </span>
        </div>

        {/* 2 — de kanalen waar het budget naartoe gaat. */}
        <div className="border-t border-site-line px-5 py-5 sm:px-7">
          <Label tone="muted">Verdeeld over {EXAMPLE_SCOPE.channels} kanalen</Label>
          <ul className="mt-3.5 flex flex-wrap gap-2">
            {MEDIA_INPUTS.map((channel, i) => (
              <li
                key={channel}
                className="site-stagger u-inset px-3 py-1.5 text-[0.8125rem] font-medium text-site-ink"
                style={{ ["--d" as string]: `${i * 70}ms` }}
              >
                {channel}
              </li>
            ))}
          </ul>
        </div>

        {/* 3 — alles komt samen in het bedrijfsresultaat. */}
        <div className="relative border-t border-site-line bg-site-paper-2/60 px-5 sm:px-7">
          <Converge />
          <p className="pb-5 text-center">
            <span className="u-pill u-label-sm text-site-ink">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-site-green-text" />
              Bedrijfsresultaat
            </span>
          </p>
        </div>

        {/* 4 — wat de analyse daaruit afleidt. */}
        <div className="border-t border-site-line px-5 py-6 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label>Geschatte bijdrage per kanaal</Label>
            <ExampleTag />
          </div>

          <ul className="mt-5 space-y-3">
            {CHANNELS.map((channel, i) => (
              <li key={channel.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_3rem] sm:gap-4">
                <span className="truncate text-[0.8125rem] font-medium text-site-ink sm:text-[0.875rem]">
                  {channel.label}
                </span>
                <span className="block h-2 rounded-full bg-site-paper-3">
                  <span
                    className="site-bar block h-2 rounded-full bg-site-green-text"
                    style={{
                      ["--w" as string]: `${(channel.effectShare / 30) * 100}%`,
                      ["--w0" as string]: "0%",
                      ["--d" as string]: `${600 + i * 90}ms`,
                    }}
                  />
                </span>
                <span className="tnum text-right font-mono text-[0.8125rem] font-semibold text-site-ink">
                  {nl(channel.effectShare)}%
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-[0.8125rem] leading-relaxed text-site-muted-2">
            De zeven kanalen zijn voor de analyse samengevat tot {EXAMPLE_SCOPE.groups} groepen.
            Samen verklaren ze het deel van het resultaat dat aan media wordt toegeschreven —
            niet het hele resultaat.
          </p>
        </div>
      </Anim>
    </div>
  );
}

/** De samenvloeiing: zeven lijnen die naar één punt lopen en zichzelf tekenen. */
function Converge() {
  const xs = [70, 225, 380, 500, 620, 775, 930];
  return (
    <svg aria-hidden="true" viewBox="0 0 1000 96" preserveAspectRatio="none" className="h-16 w-full sm:h-24">
      {xs.map((x, i) => (
        <path
          key={x}
          d={`M ${x} 0 C ${x} 50, 500 38, 500 96`}
          fill="none"
          stroke="#2E9E50"
          strokeOpacity={0.4}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          className="site-draw"
          style={{ ["--len" as string]: "240", ["--d" as string]: `${200 + i * 60}ms` }}
        />
      ))}
    </svg>
  );
}

/** Kleine hulpfunctie voor bedragen in de flow. */
export function budgetLabel(): string {
  return euroShort(TOTAL_BUDGET);
}
