"use client";

import { useMemo } from "react";
import { EXAMPLE_SCOPE, JOURNEY, MODEL_DRIVERS, TRACKING_GAPS, weeklySeries } from "@/lib/site/exampleData";
import { Anim, Reveal } from "./motion";
import { Container, ExampleTag, Label, Section, SectionHead } from "./primitives";

/**
 * Hoofdstuk 3 — het inhoudelijke hart: je hoeft niet iedere klant te kunnen volgen om je
 * marketing te begrijpen. Links de klantreis zoals attributie hem probeert te volgen, met de
 * plekken waar dat spoor onderbreekt. Rechts dezelfde werkelijkheid van bovenaf: jaren aan
 * weken, waarin media naast prijs, promoties, seizoen en trend wordt gewogen.
 */
export function PerspectiveSection() {
  return (
    <Section id="perspectief" wash labelledBy="perspectief-titel">
      <Container>
        <Reveal>
          <SectionHead
            id="perspectief-titel"
            watermark="Perspectief"
            label="Hoofdstuk 02 · een ander vertrekpunt"
            title="Van individuele klant"
            accent="naar het grotere geheel."
          />
        </Reveal>

        <div className="mt-10 grid gap-x-16 gap-y-6 lg:grid-cols-2">
          <Reveal delay={60}>
            <div className="space-y-5 text-[1.0625rem] leading-relaxed text-site-muted">
              <p>
                Attributie probeert de klantreis te volgen: welke advertentie was verantwoordelijk
                voor welke conversie? Dat werkt zolang je die reis kunt zien. In de praktijk valt
                een deel ervan buiten beeld.
              </p>
              <p>
                Media Mix Modeling stelt een andere vraag. Niet welke klik bij welke aankoop hoorde,
                maar hoe veranderingen in je mediabestedingen samenhangen met veranderingen in je
                bedrijfsresultaat over langere tijd.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="space-y-5 text-[1.0625rem] leading-relaxed text-site-muted">
              <p>
                Daarbij kijkt het model niet alleen naar media. Ook factoren die het resultaat
                kunnen beïnvloeden worden meegenomen: prijs, promoties, seizoen, trends,
                feestdagen, economische omstandigheden en andere relevante bedrijfs- of
                marktfactoren.
              </p>
              <p className="text-site-ink">
                Niet één klant. Niet één klik. Niet één platform. Maar het geheel.
              </p>
            </div>
          </Reveal>
        </div>

        <Anim className="mt-14 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.25fr)] lg:items-stretch lg:gap-6">
          {/* Attributie: de reis, en waar het spoor onderbreekt. */}
          <div className="site-stagger u-card flex flex-col p-5 sm:p-7">
            <Label tone="muted">Attributie · één klantreis</Label>

            <ol className="mt-6 space-y-0">
              {JOURNEY.map((step, i) => (
                <li key={step.label}>
                  <div className="flex items-baseline gap-3">
                    <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-site-line-2 bg-site-paper-3" />
                    <span className="flex-1">
                      <span className="block text-[0.9375rem] font-semibold text-site-ink">{step.label}</span>
                      <span className="block text-[0.78rem] text-site-muted-2">{step.note}</span>
                    </span>
                  </div>
                  {i < JOURNEY.length - 1 && (
                    <div className="ml-[3px] flex items-center gap-2 py-2 pl-0">
                      <span aria-hidden="true" className="ml-[0px] block h-7 w-px border-l border-dashed border-site-line-2" />
                      <span className="u-pill u-label-sm ml-1 text-site-muted-2">{TRACKING_GAPS[i]}</span>
                    </div>
                  )}
                </li>
              ))}
            </ol>

            <p className="mt-auto pt-6 text-[0.875rem] leading-relaxed text-site-muted">
              Tussen die stappen zit meting die niet altijd doorloopt. Wat je overhoudt is een deel
              van de reis, niet het geheel.
            </p>
          </div>

          {/* De overgang tussen beide perspectieven. */}
          <div className="site-stagger flex items-center justify-center py-2" style={{ ["--d" as string]: "140ms" }}>
            <span aria-hidden="true" className="u-pill h-11 w-11 justify-center p-0 text-site-violet">
              <svg viewBox="0 0 16 16" className="h-4 w-4 rotate-90 lg:rotate-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </div>

          {/* MMM: dezelfde werkelijkheid, maar over jaren en met alle invloeden erbij. */}
          <div className="site-stagger u-card u-card-md flex flex-col p-5 sm:p-7" style={{ ["--d" as string]: "260ms" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label>Media Mix Modeling · {EXAMPLE_SCOPE.weeksLabel}</Label>
              <ExampleTag />
            </div>

            <ResultLine />

            <ul className="mt-5 space-y-2">
              {MODEL_DRIVERS.map((driver, i) => (
                <li key={driver.key} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-[0.8125rem] font-medium text-site-ink">{driver.label}</span>
                  <DriverTrack index={i} accent={driver.key === "media"} />
                  <span className="hidden w-40 shrink-0 truncate text-[0.78rem] text-site-muted-2 sm:block">
                    {driver.note}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-center justify-center gap-3 border-t border-site-line pt-6">
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 rotate-90 text-site-muted-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
              <span className="u-pill u-label-sm text-site-green-text">Geschatte bijdrage per kanaal</span>
            </div>
          </div>
        </Anim>
      </Container>
    </Section>
  );
}

/** De resultaatlijn over de hele periode, met de jaren eronder. */
function ResultLine() {
  const series = useMemo(() => weeklySeries(EXAMPLE_SCOPE.weeks), []);
  const W = 560;
  const H = 96;
  const max = Math.max(...series.map((p) => p.result)) * 1.04;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - (v / max) * H;
  const path = series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.result).toFixed(1)}`).join(" ");

  return (
    <div className="mt-6">
      <Label tone="muted">Bedrijfsresultaat per week</Label>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="mt-3 h-24 w-full">
        <path
          d={path}
          fill="none"
          stroke="#0B0B0C"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
          className="site-draw"
          style={{ ["--len" as string]: "6000", ["--d" as string]: "200ms" }}
        />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[0.62rem] text-site-muted-2">
        {["2022", "2023", "2024", "2025", "2026"].map((year) => (
          <span key={year}>{year}</span>
        ))}
      </div>
    </div>
  );
}

/** Eén invloedsfactor als rustige reeks blokjes: genoeg om te zien dát hij meebeweegt. */
function DriverTrack({ index, accent }: { index: number; accent: boolean }) {
  const bars = Array.from({ length: 28 }, (_, i) => {
    const wave = Math.sin(i * 0.55 + index * 1.3) * 0.5 + 0.5;
    const spike = index === 1 && (i % 9 === 4 || i % 9 === 5) ? 1 : 0;
    return Math.max(0.18, Math.min(1, wave * 0.8 + spike));
  });

  return (
    <span className="flex h-5 flex-1 items-end gap-[2px]">
      {bars.map((v, i) => (
        <span
          key={i}
          className="site-fade block flex-1 rounded-[1px]"
          style={{
            height: `${v * 100}%`,
            backgroundColor: accent ? "#2E9E50" : "#D3D3D8",
            ["--d" as string]: `${300 + index * 70 + i * 8}ms`,
          }}
        />
      ))}
    </span>
  );
}
