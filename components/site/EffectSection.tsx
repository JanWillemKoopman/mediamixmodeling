"use client";

import { useMemo } from "react";
import { CHANNELS, TOTAL_BUDGET, contributionIndex, weeklySeries } from "@/lib/site/exampleData";
import { euroShort, nl } from "@/lib/site/format";
import { Anim, Reveal } from "./motion";
import { CardBar, Container, ExampleTag, Label, Section, SectionHead } from "./primitives";

/**
 * Wat de applicatie oplevert, in één beeld: per kanaal de besteding naast de geschatte
 * bijdrage, met bandbreedte. De regel eronder — bijdrage per euro — is waar het gesprek over
 * budget begint: waar het geld staat, is niet waar het effect zit.
 */
export function EffectSection() {
  const totalContribution = CHANNELS.reduce((sum, c) => sum + c.contribution, 0);

  return (
    <Section id="effect" wash labelledBy="effect-titel">
      <Container>
        <Reveal>
          <SectionHead
            id="effect-titel"
            watermark="Effect"
            label="Media-effect · per kanaal"
            title="Maak het effect van je"
            accent="mediabudget zichtbaar."
            intro="We leggen je mediabestedingen naast je eigen resultaatcijfers, week voor week, over meerdere jaren — en houden rekening met wat je resultaat verder beweegt: prijs, promoties, seizoen en markt."
          />
        </Reveal>

        <Reveal delay={100}>
          <Anim className="u-card u-card-md mt-14 overflow-hidden">
            <CardBar
              title="Besteding versus geschatte bijdrage"
              right={
                <span className="flex items-center gap-3">
                  <span className="u-label-sm u-label hidden text-site-muted-2 sm:inline">
                    {euroShort(TOTAL_BUDGET)} → {euroShort(totalContribution)}
                  </span>
                  <ExampleTag />
                </span>
              }
            />

            <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              {/* Per kanaal: twee balken en een index. */}
              <div className="px-4 py-6 sm:px-6 sm:py-8">
                <div className="grid grid-cols-[6rem_minmax(0,1fr)_4.5rem] items-center gap-3 pb-3 sm:grid-cols-[8rem_minmax(0,1fr)_6rem] sm:gap-5">
                  <span className="u-label-sm u-label text-site-muted-2">Kanaal</span>
                  <span className="u-label-sm u-label flex gap-4 text-site-muted-2">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-3.5 rounded-full bg-[#8A8A92]" /> besteding
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-3.5 rounded-full bg-site-green-text" /> bijdrage
                    </span>
                  </span>
                  <span className="u-label-sm u-label text-right text-site-muted-2">per €</span>
                </div>

                <ul className="divide-y divide-site-line border-t border-site-line">
                  {CHANNELS.map((channel, i) => (
                    <ChannelRow key={channel.key} index={i} />
                  ))}
                </ul>

                <p className="mt-6 text-[0.875rem] leading-relaxed text-site-muted">
                  Boven de 1,00 draagt een kanaal naar schatting meer bij dan het kost; daaronder
                  minder. Het is een vergelijkingsmaat tussen je eigen kanalen, geen rendement.
                </p>
              </div>

              {/* De reeks waar de schatting op rust. */}
              <div className="border-t border-site-line px-4 py-6 sm:px-6 sm:py-8 lg:border-l lg:border-t-0">
                <Label tone="muted">Resultaat per week · 104 weken</Label>
                <WeeklyChart />
                <p className="mt-5 text-[0.875rem] leading-relaxed text-site-muted">
                  Pieken vallen niet vanzelf samen met media: een deel komt van promoties, prijs en
                  seizoen. Het model schat welk deel van de beweging bij je mediabestedingen hoort.
                </p>

                <div className="u-inset mt-6 p-4">
                  <Label tone="muted">Waarom een bandbreedte</Label>
                  <p className="mt-2 text-[0.85rem] leading-relaxed text-site-muted">
                    Een schatting met een eerlijke marge is meer waard dan een cijfer met valse
                    precisie. De marge zegt hoeveel gewicht je aan een uitkomst kunt hangen.
                  </p>
                </div>
              </div>
            </div>
          </Anim>
        </Reveal>
      </Container>
    </Section>
  );
}

const DOMAIN = 3_100_000;

function ChannelRow({ index }: { index: number }) {
  const channel = CHANNELS[index];
  const index_ = contributionIndex(channel);
  const behind = index_ < 1;

  return (
    <li className="grid grid-cols-[6rem_minmax(0,1fr)_4.5rem] items-center gap-3 py-3.5 sm:grid-cols-[8rem_minmax(0,1fr)_6rem] sm:gap-5">
      <span className="truncate text-[0.875rem] font-medium text-site-ink">{channel.label}</span>

      <span className="block space-y-1.5">
        <span className="flex items-center gap-2.5">
          <span className="relative block h-2 flex-1 rounded-full bg-site-paper-3">
            <span
              className="site-bar absolute left-0 top-0 h-2 rounded-full bg-[#8A8A92]"
              style={{
                ["--w" as string]: `${(channel.spend / DOMAIN) * 100}%`,
                ["--w0" as string]: "0%",
                ["--d" as string]: `${index * 70}ms`,
              }}
            />
          </span>
          <span className="tnum w-16 shrink-0 text-right font-mono text-[0.72rem] text-site-muted">
            {euroShort(channel.spend)}
          </span>
        </span>

        <span className="flex items-center gap-2.5">
          <span className="relative block h-2 flex-1 rounded-full bg-site-paper-3">
            {/* Bandbreedte rond de schatting. */}
            <span
              className="site-fade absolute top-0 h-2 rounded-full bg-site-green-soft"
              style={{
                left: `${(channel.low / DOMAIN) * 100}%`,
                width: `${((channel.high - channel.low) / DOMAIN) * 100}%`,
                ["--d" as string]: `${350 + index * 70}ms`,
              }}
            />
            <span
              className="site-bar absolute left-0 top-0 h-2 rounded-full"
              style={{
                ["--w" as string]: `${(channel.contribution / DOMAIN) * 100}%`,
                ["--w0" as string]: "0%",
                ["--d" as string]: `${120 + index * 70}ms`,
                backgroundColor: behind ? "#8511D9" : "#2E9E50",
              }}
            />
          </span>
          <span className="tnum w-16 shrink-0 text-right font-mono text-[0.72rem] font-semibold text-site-ink">
            {euroShort(channel.contribution)}
          </span>
        </span>
      </span>

      <span
        className={`tnum text-right font-mono text-[0.82rem] font-bold ${
          behind ? "text-site-violet" : "text-site-green-text"
        }`}
      >
        {nl(index_, 2)}×
      </span>
    </li>
  );
}

/** Wekelijkse reeks: resultaat, geschat media-aandeel en de band daaromheen. */
function WeeklyChart() {
  const series = useMemo(() => weeklySeries(104), []);
  const W = 520;
  const H = 190;
  const max = Math.max(...series.map((p) => p.result)) * 1.06;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - (v / max) * H;
  const line = (get: (p: (typeof series)[number]) => number) =>
    series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(get(p)).toFixed(1)}`).join(" ");
  const band = [
    ...series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.mediaHigh).toFixed(1)}`),
    ...series.slice().reverse().map((p, i) => `L ${x(series.length - 1 - i).toFixed(1)} ${y(p.mediaLow).toFixed(1)}`),
    "Z",
  ].join(" ");

  return (
    <>
      <svg
        role="img"
        aria-label="Wekelijks resultaat over 104 weken met het geschatte deel dat samenhangt met media en de bandbreedte daaromheen. Voorbeelddata."
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-4 h-[190px] w-full"
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={y(max * f)} y2={y(max * f)} stroke="#E5E5E5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={band} fill="#2E9E50" fillOpacity="0.14" className="site-fade" style={{ ["--d" as string]: "500ms" }} />
        <path d={line((p) => p.result)} fill="none" stroke="#C0C0C6" strokeWidth="1.25" vectorEffect="non-scaling-stroke" className="site-draw" style={{ ["--len" as string]: "4000" }} />
        <path d={line((p) => p.media)} fill="none" stroke="#2E9E50" strokeWidth="2" vectorEffect="non-scaling-stroke" className="site-draw" style={{ ["--len" as string]: "4000", ["--d" as string]: "200ms" }} />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[0.62rem] text-site-muted-2">
        <span>week 1</span>
        <span>week 52</span>
        <span>week 104</span>
      </div>
    </>
  );
}
