"use client";

import { useMemo } from "react";
import { CHANNELS, EFFECT_STEPS, weeklySeries } from "@/lib/site/exampleData";
import { nl } from "@/lib/site/format";
import { Anim, Reveal } from "./motion";
import { Container, ExampleTag, PanelBar, PanelLabel, Section, SectionHead } from "./primitives";

/**
 * Sectie 05 — hier ziet de bezoeker wat de applicatie oplevert. Links de wekelijkse reeks:
 * je resultaat, en het deel daarvan dat samenhangt met media, met de band eromheen. Rechts
 * de geschatte bijdrage per kanaal, steeds als bereik, met het budgetaandeel als
 * referentiestreep — zodat het verschil tussen "waar het geld staat" en "waar het effect
 * zit" in één blik te zien is.
 */
export function EffectSection() {
  return (
    <Section id="aanpak" tone="canvas" labelledBy="effect-titel">
      <Container wide>
        <Reveal>
          <SectionHead
            id="effect-titel"
            eyebrow="Media-effect"
            title="Maak het effect van je mediabudget zichtbaar."
            intro="We leggen je mediabestedingen naast je eigen resultaatcijfers, week voor week, over meerdere jaren. Daarbij houden we rekening met factoren die je resultaat verder beïnvloeden, zoals prijs, promoties en seizoen."
          />
        </Reveal>

        <Reveal delay={100} className="mt-12 sm:mt-16">
          <Anim className="overflow-hidden rounded-panel border border-site-line bg-white shadow-site-card">
            <PanelBar
              title="Geschatte bijdrage van media"
              right={<ExampleTag>Voorbeelddata</ExampleTag>}
            />

            <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="border-b border-site-line px-4 py-6 sm:px-6 sm:py-7 lg:border-b-0 lg:border-r">
                <WeeklyChart />
              </div>
              <div className="px-4 py-6 sm:px-6 sm:py-7">
                <ContributionList />
              </div>
            </div>

            <p className="border-t border-site-line px-4 py-4 text-[0.8125rem] leading-relaxed text-site-text-muted sm:px-5">
              De bandbreedte is geen slag om de arm, maar informatie: hij zegt hoeveel gewicht je aan
              een uitkomst kunt hangen. Een schatting met een eerlijke marge is meer waard dan een
              cijfer met valse precisie.
            </p>
          </Anim>
        </Reveal>
      </Container>
    </Section>
  );
}

/** Wekelijkse reeks: resultaat, geschat media-aandeel en de band daaromheen. */
function WeeklyChart() {
  const series = useMemo(() => weeklySeries(104), []);

  const W = 720;
  const H = 240;
  const PAD = { top: 16, right: 8, bottom: 22, left: 8 };

  const max = Math.max(...series.map((p) => p.result)) * 1.06;
  const x = (i: number) => PAD.left + (i / (series.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);

  const line = (get: (p: (typeof series)[number]) => number) =>
    series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(get(p)).toFixed(1)}`).join(" ");

  const band = [
    ...series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.mediaHigh).toFixed(1)}`),
    ...series
      .slice()
      .reverse()
      .map((p, i) => `L ${x(series.length - 1 - i).toFixed(1)} ${y(p.mediaLow).toFixed(1)}`),
    "Z",
  ].join(" ");

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-site-text">
          Resultaat per week
        </h3>
        <div className="flex items-center gap-4">
          <LegendItem label="resultaat" swatch={<span className="h-px w-4 bg-site-text-faint" />} />
          <LegendItem label="deel media" swatch={<span className="h-[2px] w-4 rounded-full bg-site-blue" />} />
          <LegendItem label="bandbreedte" swatch={<span className="h-2.5 w-4 rounded-sm bg-site-blue/20" />} />
        </div>
      </div>

      <svg
        role="img"
        aria-label="Wekelijks resultaat over 104 weken, met het geschatte deel dat samenhangt met media en de bandbreedte daaromheen. Voorbeelddata."
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-5 h-[220px] w-full sm:h-[260px]"
      >
        {/* Rustig raster: vier lijnen, geen assen vol getallen. */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="#0B1020"
            strokeOpacity={0.06}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={band} fill="#1F5AFF" fillOpacity={0.14} className="site-fade" style={{ ["--d" as string]: "500ms" }} />

        <path
          d={line((p) => p.result)}
          fill="none"
          stroke="#7A8499"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
          className="site-draw"
          style={{ ["--len" as string]: "4000" }}
        />
        <path
          d={line((p) => p.media)}
          fill="none"
          stroke="#1F5AFF"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className="site-draw"
          style={{ ["--len" as string]: "4000", ["--d" as string]: "200ms" }}
        />
      </svg>

      <div className="mt-1 flex justify-between font-mono text-[10px] text-site-text-faint">
        <span>week 1</span>
        <span>week 52</span>
        <span>week 104</span>
      </div>

      <p className="mt-4 text-[0.875rem] leading-relaxed text-site-text-muted">
        Pieken vallen niet vanzelf samen met media: een deel komt van promoties, prijs en seizoen.
        Het model schat welk deel van de beweging bij je mediabestedingen hoort.
      </p>

      {/* Waar de schatting op rust: omvang van de dataset, in de taal van het product. */}
      <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-card border border-site-line bg-site-line">
        {[
          { label: "Historie", value: "209 weken" },
          { label: "Kanaalgroepen", value: "5" },
          { label: "Meegewogen factoren", value: "14" },
        ].map((item) => (
          <div key={item.label} className="bg-white px-3 py-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-site-text-faint">
              {item.label}
            </dt>
            <dd className="tnum mt-1 font-display text-base font-semibold text-site-text">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LegendItem({ label, swatch }: { label: string; swatch: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-site-text-faint">
      {swatch}
      {label}
    </span>
  );
}

/** Geschatte bijdrage per kanaal, met bandbreedte en het budgetaandeel als referentie. */
function ContributionList() {
  const DOMAIN = 40;
  const pos = (v: number) => (v / DOMAIN) * 100;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-site-text">
          Bijdrage per kanaal
        </h3>
        <div className="flex items-center gap-4">
          <LegendItem label="bijdrage" swatch={<span className="h-2.5 w-4 rounded-sm bg-site-blue/25" />} />
          <LegendItem
            label="budgetaandeel"
            swatch={<span className="h-3 w-px bg-site-text-faint" />}
          />
        </div>
      </div>

      <ul className="mt-5 space-y-5">
        {CHANNELS.map((channel, i) => (
          <li key={channel.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.9375rem] text-site-text">{channel.label}</span>
              <span className="flex items-baseline gap-2.5">
                <span className="tnum font-display text-xl font-semibold tracking-[-0.02em] text-site-text">
                  {nl(channel.effectShare)}%
                </span>
                <span className="tnum font-mono text-[11px] text-site-text-faint">
                  {nl(channel.effectLow)}–{nl(channel.effectHigh)}%
                </span>
              </span>
            </div>

            <div className="relative mt-2.5 h-5">
              <div className="absolute inset-x-0 top-2 h-1 rounded-full bg-site-surface-3" />
              {/* Bandbreedte van de schatting. */}
              <div
                className="site-bar absolute top-0.5 h-4 rounded-[4px]"
                style={{
                  ["--w" as string]: `${pos(channel.effectHigh - channel.effectLow)}%`,
                  ["--w0" as string]: "0%",
                  ["--d" as string]: `${i * 90}ms`,
                  left: `${pos(channel.effectLow)}%`,
                  backgroundColor: EFFECT_STEPS[i],
                  opacity: 0.28,
                }}
              />
              {/* Middenschatting. */}
              <div
                className="site-fade absolute top-0 h-5 w-[3px] rounded-full"
                style={{
                  left: `${pos(channel.effectShare)}%`,
                  backgroundColor: EFFECT_STEPS[i],
                  ["--d" as string]: `${300 + i * 90}ms`,
                }}
              />
              {/* Referentie: waar het budget nu staat. */}
              <div
                className="site-fade absolute top-0 h-5 w-px bg-site-text-faint"
                style={{ left: `${pos(channel.spendShare)}%`, ["--d" as string]: `${500 + i * 90}ms` }}
                title={`Budgetaandeel ${nl(channel.spendShare)}%`}
              />
            </div>

            <p className="mt-1.5 font-mono text-[11px] text-site-text-faint">
              budget {nl(channel.spendShare)}% · rapportage {channel.platformMetric}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
