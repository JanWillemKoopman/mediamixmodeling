"use client";

import { CHANNELS, DECOMPOSITION, PLATFORM_SIGNALS } from "@/lib/site/exampleData";
import { euroShort, nl } from "@/lib/site/format";
import { Anim, Reveal } from "./motion";
import { Container, ExampleTag, Label, Section, SectionHead } from "./primitives";

/**
 * Het probleem, in één beeld: links de losse signalen zoals ze binnenkomen, rechts wat er
 * ontstaat als je ze in samenhang analyseert. Het contrast tussen de twee panelen doet het
 * werk; de tekst blijft kort.
 */
export function ProblemSection() {
  return (
    <Section id="vraag" labelledBy="vraag-titel">
      <Container>
        <Reveal>
          <SectionHead
            id="vraag-titel"
            watermark="Signaal"
            label="De vraag · fragmentatie"
            title="Geen gebrek aan cijfers."
            accent="Wel aan een totaalbeeld."
            intro="Je hebt cijfers uit Google, Meta, YouTube, TV, radio, analytics en je eigen systemen. Elk platform vertelt wat het eigen kanaal heeft opgeleverd. Geen van die systemen vertelt wat er in samenhang met je andere kanalen is gebeurd."
          />
        </Reveal>

        <Anim className="mt-14 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch lg:gap-6">
          {/* Wat er nu binnenkomt: acht bronnen, acht maatstaven. */}
          <div className="site-stagger u-card flex flex-col p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <Label tone="muted">Vandaag · losse rapportages</Label>
              <span className="u-label-sm u-label text-site-muted-2">8 bronnen</span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2.5">
              {PLATFORM_SIGNALS.map((signal) => (
                <div key={signal.source} className="u-inset px-3 py-2.5">
                  <p className="truncate text-[0.8125rem] font-semibold text-site-ink">{signal.source}</p>
                  <p className="tnum mt-1 truncate font-mono text-[0.72rem] text-site-muted">
                    {signal.metric} {signal.value}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-6 text-[0.875rem] leading-relaxed text-site-muted">
              Acht maatstaven in acht eenheden, elk met een eigen attributiemodel en een eigen
              periode. Optellen mag niet, vergelijken kan niet.
            </p>
          </div>

          {/* De overgang. */}
          <div className="site-stagger flex items-center justify-center py-2" style={{ ["--d" as string]: "140ms" }}>
            <span aria-hidden="true" className="u-pill h-11 w-11 justify-center p-0 text-site-violet">
              <svg viewBox="0 0 16 16" className="h-4 w-4 rotate-90 lg:rotate-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </div>

          {/* Wat de analyse ervan maakt: één beeld, één maatstaf. */}
          <div className="site-stagger u-card u-card-md flex flex-col p-5 sm:p-7" style={{ ["--d" as string]: "260ms" }}>
            <div className="flex items-center justify-between gap-3">
              <Label>Met media-effect · één beeld</Label>
              <ExampleTag />
            </div>

            <p className="u-label mt-6 text-site-muted-2">Waar het resultaat vandaan komt</p>
            <div className="mt-3 flex h-12 gap-[2px] overflow-hidden rounded-chip">
              {DECOMPOSITION.map((part, i) => (
                <div
                  key={part.label}
                  className="site-bar flex min-w-0 items-center justify-center first:rounded-l-chip last:rounded-r-chip"
                  style={{
                    ["--w" as string]: `${part.value}%`,
                    ["--w0" as string]: "0%",
                    ["--d" as string]: `${300 + i * 90}ms`,
                    backgroundColor: part.accent ? "#2E9E50" : i === 0 ? "#EDEDED" : i === 2 ? "#D9D9DE" : "#C0C0C6",
                  }}
                >
                  <span className={`truncate px-2 font-mono text-[0.66rem] font-bold ${part.accent ? "text-white" : "text-site-muted"}`}>
                    {nl(part.value)}%
                  </span>
                </div>
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {DECOMPOSITION.map((part) => (
                <li key={part.label} className="flex items-center gap-1.5 text-[0.78rem] text-site-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${part.accent ? "bg-site-green-text" : "bg-site-muted-2/50"}`} />
                  {part.label}
                </li>
              ))}
            </ul>

            <p className="u-label mt-7 text-site-muted-2">Media, uitgesplitst naar kanaal</p>
            <ul className="mt-3 space-y-2">
              {CHANNELS.slice(0, 4).map((channel) => (
                <li key={channel.key} className="flex items-baseline justify-between gap-3 border-b border-site-line pb-2 last:border-b-0">
                  <span className="text-[0.875rem] text-site-ink">{channel.label}</span>
                  <span className="tnum flex items-baseline gap-2 font-mono text-[0.8rem] text-site-ink">
                    {euroShort(channel.contribution)}
                    <span className="text-[0.68rem] text-site-muted-2">
                      ({euroShort(channel.low)}–{euroShort(channel.high)})
                    </span>
                  </span>
                </li>
              ))}
              <li className="pt-1 text-[0.78rem] text-site-muted-2">+ 3 kanalen</li>
            </ul>
          </div>
        </Anim>
      </Container>
    </Section>
  );
}
