"use client";

import { useMemo } from "react";
import { CHANNELS, EXAMPLE_SCOPE, MODEL_DRIVERS, TOTAL_BUDGET, weeklySeries } from "@/lib/site/exampleData";
import { euroShort, nl } from "@/lib/site/format";
import { Anim, Reveal } from "./motion";
import { Container, ExampleTag, Label, Section, SectionHead } from "./primitives";

/**
 * Hoofdstuk 4 — pas hier komt het product zelf in beeld. Eén visualisatie waarin alles
 * samenkomt: het budget bovenaan, de ontwikkeling van het resultaat over vier jaar met de
 * factoren die eroverheen liggen, en onderaan de geschatte bijdrage per kanaal mét
 * bandbreedte — zodat meteen duidelijk is dat het geen exact getal is.
 */
export function ModelSection() {
  return (
    <Section id="model" labelledBy="model-titel">
      <Container>
        <Reveal>
          <SectionHead
            id="model-titel"
            watermark="Model"
            label="Hoofdstuk 03 · wat de analyse oplevert"
            title="Van losse marketingdata"
            accent="naar één onderbouwd beeld."
          />
        </Reveal>

        <div className="mt-10 grid gap-x-16 gap-y-6 lg:grid-cols-2">
          <Reveal delay={60}>
            <div className="space-y-5 text-[1.0625rem] leading-relaxed text-site-muted">
              <p>
                Het model combineert historische data over mediabestedingen, bedrijfsresultaat en
                relevante externe factoren. Daarmee kun je onderzoeken welke kanalen naar schatting
                bijdragen aan het resultaat — niet alleen hoeveel omzet een platform zelf
                rapporteert, maar welke bijdrage een kanaal levert binnen het totale model.
              </p>
              <p>
                Ook zie je welke invloed andere factoren hebben. Een omzetpiek hoeft niet volledig
                door media te komen: misschien liep in diezelfde periode een grote promotie, was het
                hoogseizoen of veranderde de prijs.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="space-y-5 text-[1.0625rem] leading-relaxed text-site-muted">
              <p>
                Daarnaast helpt het model inzicht te krijgen in verzadiging. Meer budget betekent
                niet automatisch een evenredig groter effect; ergens begint extra mediabudget minder
                op te leveren.
              </p>
              <p>
                En misschien wel het belangrijkste: je kunt onderzoeken wat er gebeurt als je je
                budget anders verdeelt. Daarmee verschuift de analyse van een terugblik naar een
                hulpmiddel voor je volgende budgetbeslissing.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={160}>
          <Anim className="u-card u-card-md mt-14 overflow-hidden">
            {/* Boven: het budget waar de analyse over gaat. */}
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-site-line px-5 py-5 sm:px-7">
              <div>
                <Label tone="muted">Mediabudget in de analyse</Label>
                <p className="tnum mt-2 text-[clamp(1.6rem,3vw,2.1rem)] font-extrabold leading-none tracking-[-0.035em] text-site-ink">
                  {euroShort(TOTAL_BUDGET)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="u-pill u-label-sm text-site-muted-2">
                  {EXAMPLE_SCOPE.weeksLabel} · {EXAMPLE_SCOPE.years}
                </span>
                <ExampleTag />
              </div>
            </div>

            {/* Midden: het resultaat, het deel dat aan media wordt toegeschreven, en de weken
                waarin een promotie liep. */}
            <div className="px-5 py-6 sm:px-7">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <Label tone="muted">Ontwikkeling van het resultaat</Label>
                <span className="flex flex-wrap items-center gap-4">
                  <Legend swatch={<span className="h-px w-4 bg-site-ink" />} label="resultaat" />
                  <Legend swatch={<span className="h-[2px] w-4 rounded-full bg-site-green-text" />} label="deel media" />
                  <Legend swatch={<span className="h-2.5 w-4 rounded-sm bg-site-green-soft" />} label="bandbreedte" />
                  <Legend swatch={<span className="h-2.5 w-1.5 rounded-sm bg-site-violet-soft" />} label="promotie" />
                </span>
              </div>

              <ModelChart />

              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
                {MODEL_DRIVERS.map((driver) => (
                  <li key={driver.key} className="flex items-center gap-2 text-[0.8125rem] text-site-muted">
                    <span className={`h-1.5 w-1.5 rounded-full ${driver.key === "media" ? "bg-site-green-text" : "bg-site-muted-2/60"}`} />
                    {driver.label}
                  </li>
                ))}
              </ul>
            </div>

            {/* Onder: de geschatte bijdrage per kanaal, met marge. */}
            <div className="border-t border-site-line bg-site-paper-2/60 px-5 py-6 sm:px-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label>Geschatte mediabijdrage per kanaal</Label>
                <span className="u-label-sm u-label text-site-muted-2">met bandbreedte</span>
              </div>

              <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[...CHANNELS]
                  .sort((a, b) => b.effectShare - a.effectShare)
                  .map((channel, i) => (
                    <li key={channel.key} className="u-tile site-stagger p-4" style={{ ["--d" as string]: `${i * 80}ms` }}>
                      <p className="truncate text-[0.875rem] font-semibold text-site-ink">{channel.label}</p>
                      <p className="tnum mt-2 text-[1.75rem] font-extrabold leading-none tracking-[-0.035em] text-site-ink">
                        {nl(channel.effectShare)}%
                      </p>
                      <span aria-hidden="true" className="relative mt-3 block h-3.5">
                        <span className="absolute inset-x-0 top-1.5 h-px bg-site-line" />
                        <span
                          className="absolute top-0 h-3.5 rounded-[3px] bg-site-green-soft"
                          style={{ left: `${(channel.low / 40) * 100}%`, width: `${((channel.high - channel.low) / 40) * 100}%` }}
                        />
                        <span
                          className="absolute top-0 h-3.5 w-[2px] rounded-full bg-site-green-text"
                          style={{ left: `${(channel.effectShare / 40) * 100}%` }}
                        />
                      </span>
                      <p className="tnum mt-2 font-mono text-[0.72rem] text-site-muted-2">
                        {nl(channel.low)}–{nl(channel.high)}%
                      </p>
                    </li>
                  ))}
              </ul>

              <p className="mt-5 max-w-3xl text-[0.875rem] leading-relaxed text-site-muted">
                De bandbreedte hoort bij de schatting. Hij zegt hoeveel gewicht je aan een uitkomst
                kunt hangen, en voorkomt dat een model met valse precisie een beslissing draagt.
              </p>
            </div>
          </Anim>
        </Reveal>
      </Container>
    </Section>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="u-label-sm u-label flex items-center gap-1.5 text-site-muted-2">
      {swatch}
      {label}
    </span>
  );
}

/** Resultaat per week over de volle periode, met het media-aandeel en de promotieweken. */
function ModelChart() {
  const series = useMemo(() => weeklySeries(EXAMPLE_SCOPE.weeks), []);
  const W = 900;
  const H = 240;
  const max = Math.max(...series.map((p) => p.result)) * 1.05;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - (v / max) * H;
  const line = (get: (p: (typeof series)[number]) => number) =>
    series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(get(p)).toFixed(1)}`).join(" ");
  const band = [
    ...series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.mediaHigh).toFixed(1)}`),
    ...series.slice().reverse().map((p, i) => `L ${x(series.length - 1 - i).toFixed(1)} ${y(p.mediaLow).toFixed(1)}`),
    "Z",
  ].join(" ");
  const promoWeeks = series.filter((p) => p.promo);

  return (
    <>
      <svg
        role="img"
        aria-label={`Bedrijfsresultaat per week over ${EXAMPLE_SCOPE.weeksLabel}, met het geschatte deel dat samenhangt met media, de bandbreedte daaromheen en de weken waarin een promotie liep. Voorbeelddata.`}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-4 h-[220px] w-full sm:h-[260px]"
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={y(max * f)} y2={y(max * f)} stroke="#E5E5E5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}

        {/* Promotieweken als rustige violette banden achter de lijn. */}
        {promoWeeks.map((p) => (
          <rect
            key={p.week}
            x={x(p.week - 1)}
            y="0"
            width={Math.max(x(1) - x(0), 2)}
            height={H}
            fill="#8511D9"
            fillOpacity="0.07"
            className="site-fade"
            style={{ ["--d" as string]: "700ms" }}
          />
        ))}

        <path d={band} fill="#2E9E50" fillOpacity="0.16" className="site-fade" style={{ ["--d" as string]: "500ms" }} />
        <path d={line((p) => p.result)} fill="none" stroke="#0B0B0C" strokeWidth="1.3" vectorEffect="non-scaling-stroke" className="site-draw" style={{ ["--len" as string]: "8000" }} />
        <path d={line((p) => p.media)} fill="none" stroke="#2E9E50" strokeWidth="2" vectorEffect="non-scaling-stroke" className="site-draw" style={{ ["--len" as string]: "8000", ["--d" as string]: "220ms" }} />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[0.62rem] text-site-muted-2">
        {["2022", "2023", "2024", "2025", "2026"].map((year) => (
          <span key={year}>{year}</span>
        ))}
      </div>
    </>
  );
}
