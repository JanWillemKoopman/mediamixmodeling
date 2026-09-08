"use client";

import { CHANNELS, EFFECT_STEPS, PLATFORM_SIGNALS } from "@/lib/site/exampleData";
import { nl } from "@/lib/site/format";
import { Anim, Reveal } from "./motion";
import { Container, ExampleTag, PanelBar, Section, SectionHead } from "./primitives";

/**
 * Sectie 02 — het probleem. Niet "je hebt geen data", maar: elk systeem rapporteert zijn
 * eigen succes en niemand kijkt naar het totaal. De visualisatie is de kern: acht losse
 * signalen die samenvloeien tot één beeld. Chaos → samenhang, in één figuur.
 */
export function ProblemSection() {
  return (
    <Section id="de-vraag" tone="canvas" labelledBy="de-vraag-titel">
      <Container wide>
        <Reveal>
          <SectionHead
            id="de-vraag-titel"
            eyebrow="De vraag"
            title={
              <>
                Je hebt genoeg marketingdata.
                <br className="hidden sm:block" /> Je mist het totaalbeeld.
              </>
            }
            intro="Elk platform rapporteert zijn eigen succes. Geen van die systemen kijkt naar je totale media-inzet, en geen van die maatstaven is met een andere te vergelijken. Opgeteld levert dat geen antwoord op de enige vraag die telt: wat draagt onze media bij aan het resultaat?"
          />
        </Reveal>

        <Reveal delay={100} className="mt-12 sm:mt-16">
          <ConvergenceFigure />
        </Reveal>
      </Container>
    </Section>
  );
}

function ConvergenceFigure() {
  return (
    <Anim className="overflow-hidden rounded-panel border border-site-line bg-white shadow-site-card" threshold={0.2}>
      <PanelBar
        title="Signalen uit je stack"
        right={<span className="font-mono text-[11px] text-site-text-faint">8 bronnen · 8 maatstaven</span>}
      />

      {/* Acht losse signalen: allemaal waar, geen twee vergelijkbaar. */}
      <div className="grid grid-cols-2 gap-px bg-site-line sm:grid-cols-4">
        {PLATFORM_SIGNALS.map((signal, i) => (
          <div
            key={signal.source}
            className="site-stagger bg-white px-4 py-4 transition-colors duration-300 hover:bg-site-surface-2"
            style={{ ["--d" as string]: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[0.8125rem] font-medium text-site-text">{signal.source}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-site-text-faint">
                {signal.metric}
              </span>
            </div>
            <p className="tnum mt-2 font-display text-[1.375rem] font-semibold tracking-[-0.02em] text-site-text">
              {signal.value}
            </p>
            <p className="mt-1 truncate text-[11px] text-site-text-faint" title={signal.note}>
              {signal.note}
            </p>
          </div>
        ))}
      </div>

      {/* De samenvloeiing. De lijnen tekenen zichzelf zodra de figuur in beeld komt. */}
      <div className="relative border-t border-site-line bg-site-surface-2/50 px-4 sm:px-6">
        <svg
          aria-hidden="true"
          viewBox="0 0 1000 110"
          preserveAspectRatio="none"
          className="h-[88px] w-full sm:h-[110px]"
        >
          {[62, 187, 312, 437, 562, 687, 812, 937].map((x, i) => {
            const d = `M ${x} 0 C ${x} 55, 500 45, 500 110`;
            return (
              <path
                key={x}
                d={d}
                fill="none"
                stroke="#1F5AFF"
                strokeOpacity={0.45}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                className="site-draw"
                style={{ ["--len" as string]: "260", ["--d" as string]: `${i * 70}ms` }}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
          <span className="site-fade translate-y-1/2 rounded-full border border-site-line bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-site-blue shadow-site-card" style={{ ["--d" as string]: "700ms" }}>
            één analyse
          </span>
        </div>
      </div>

      {/* Het samengevoegde beeld: dezelfde vijf kanalen, op één maatstaf. */}
      <div className="border-t border-site-line px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-site-text">
            Geschat totaal media-effect
          </h3>
          <ExampleTag>Voorbeelddata</ExampleTag>
        </div>

        <div className="mt-4 flex h-14 w-full gap-[2px] overflow-hidden rounded-[10px]">
          {CHANNELS.map((channel, i) => (
            <div
              key={channel.key}
              className="site-bar flex min-w-0 flex-col items-start justify-center gap-0.5 overflow-hidden px-2.5 first:rounded-l-[10px] last:rounded-r-[10px]"
              style={{
                ["--w" as string]: `${channel.effectShare}%`,
                ["--w0" as string]: `${channel.spendShare}%`,
                ["--d" as string]: `${900 + i * 60}ms`,
                backgroundColor: EFFECT_STEPS[i],
              }}
            >
              <span className={`truncate font-mono text-[10px] ${i < 3 ? "text-white/70" : "text-site-text/60"}`}>
                {channel.label}
              </span>
              <span className={`tnum truncate text-[0.8125rem] font-medium ${i < 3 ? "text-white" : "text-site-text"}`}>
                {nl(channel.effectShare)}%
              </span>
            </div>
          ))}
        </div>

        <p className="mt-4 max-w-2xl text-[0.875rem] leading-relaxed text-site-text-muted">
          Geen achtste maatstaf erbij, maar één beeld waarin de kanalen op dezelfde manier en over
          dezelfde periode zijn beoordeeld — inclusief de factoren die je resultaat verder bepalen.
        </p>
      </div>
    </Anim>
  );
}
