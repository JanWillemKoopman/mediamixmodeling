"use client";

import { DECOMPOSITION, EFFECT_STEPS, PLATFORM_SIGNALS, REPORTING_GAP } from "@/lib/site/exampleData";
import { nl } from "@/lib/site/format";
import { Reveal, useCountUp, useInView, useStepper } from "./motion";
import { Container, ExampleTag, PanelLabel, Section, SectionHead } from "./primitives";

/**
 * Sectie 03 — het scherpste onderscheid van de hele site: rapporteren is iets anders dan
 * verklaren. Drie standen, in deze volgorde: wat de platforms optellen, wat het bedrijf zelf
 * registreerde, en wat een analyse daar overhoudt om te verklaren. De bezoeker ziet het
 * verschil in plaats van erover te lezen.
 */

const STAGES = [
  { key: "gerapporteerd", label: "Wat platforms rapporteren" },
  { key: "geregistreerd", label: "Wat je bedrijf registreert" },
  { key: "verklaard", label: "Wat de analyse verklaart" },
] as const;

export function ReportingSection() {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  const { step, setStep, setPaused } = useStepper(STAGES.length, inView, 4600);

  return (
    <Section id="media-effect" tone="surface" labelledBy="verklaren-titel">
      <Container wide>
        <Reveal>
          <SectionHead
            id="verklaren-titel"
            eyebrow="Rapportage versus verklaring"
            title="Rapporteren is iets anders dan verklaren."
            intro="Platformrapportages tellen op wat ze zelf hebben gezien. Ze corrigeren niet voor elkaar, niet voor je prijs, niet voor je promoties en niet voor het seizoen. Een verklaring begint pas als je alles tegelijk bekijkt."
          />
        </Reveal>

        <div ref={ref} className="mt-12 grid gap-8 lg:mt-16 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-12">
          {/* De drie stappen als bediening: klikken pint de stand vast. */}
          <Reveal>
            <ol className="relative flex gap-2 lg:flex-col lg:gap-0">
              {STAGES.map((stage, i) => (
                <li key={stage.key} className="flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPaused(true);
                      setStep(i);
                    }}
                    aria-current={step === i}
                    className={`group relative w-full border-site-line py-3 text-left transition-colors duration-300 lg:border-t lg:py-5 ${
                      step === i ? "text-site-text" : "text-site-text-faint hover:text-site-text-muted"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`font-mono text-[11px] tabular-nums transition-colors ${
                          step === i ? "text-site-blue" : "text-site-text-faint"
                        }`}
                      >
                        0{i + 1}
                      </span>
                      <span className="text-[0.9375rem] font-medium leading-snug">{stage.label}</span>
                    </span>
                    {/* Voortgangslijn: vult zich zolang deze stand actief is. */}
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-0 -top-px h-px origin-left bg-site-blue transition-transform duration-500 ${
                        step === i ? "scale-x-100" : "scale-x-0"
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ol>
          </Reveal>

          <Reveal delay={80}>
            <div className="overflow-hidden rounded-panel border border-site-line bg-site-canvas shadow-site-card">
              <div className="flex items-center justify-between gap-3 border-b border-site-line px-4 py-3 sm:px-5">
                <PanelLabel>{STAGES[step].label}</PanelLabel>
                <ExampleTag>Voorbeelddata</ExampleTag>
              </div>
              <div className="min-h-[22rem] px-4 py-6 sm:px-6 sm:py-8">
                {step === 0 && <ReportedStage active={inView} />}
                {step === 1 && <RegisteredStage />}
                {step === 2 && <ExplainedStage />}
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

/** Stand 1: zeven systemen, zeven waarheden, één optelsom die niemand kan controleren. */
function ReportedStage({ active }: { active: boolean }) {
  const total = useCountUp(REPORTING_GAP.reported, active, 1200);
  return (
    <div>
      <div className="grid gap-px overflow-hidden rounded-card border border-site-line bg-site-line sm:grid-cols-2">
        {PLATFORM_SIGNALS.slice(0, 6).map((signal) => (
          <div key={signal.source} className="flex items-baseline justify-between gap-3 bg-white px-4 py-3">
            <span className="text-[0.875rem] text-site-text">{signal.source}</span>
            <span className="tnum font-mono text-[0.8125rem] text-site-text-muted">
              {signal.metric} {signal.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <PanelLabel>Opgeteld uit alle platformrapportages</PanelLabel>
          <p className="tnum mt-2 font-display text-[2.5rem] font-semibold leading-none tracking-[-0.03em] text-site-text">
            {nl(Math.round(total))}
          </p>
          <p className="mt-1.5 text-[0.875rem] text-site-text-muted">conversies</p>
        </div>
        <p className="max-w-xs text-[0.875rem] leading-relaxed text-site-text-muted">
          Elk systeem rekent zichzelf dezelfde order toe. Optellen mag dus eigenlijk niet — en toch
          is dit het getal dat in de meeste rapportages staat.
        </p>
      </div>
    </div>
  );
}

/** Stand 2: het eigen ordersysteem. Hetzelfde bedrijf, dezelfde periode, een ander getal. */
function RegisteredStage() {
  const max = Math.max(REPORTING_GAP.reported, REPORTING_GAP.actual);
  const gap = REPORTING_GAP.reported - REPORTING_GAP.actual;
  const rows = [
    { label: REPORTING_GAP.reportedLabel, value: REPORTING_GAP.reported, tone: "muted" as const },
    { label: REPORTING_GAP.actualLabel, value: REPORTING_GAP.actual, tone: "blue" as const },
  ];

  return (
    <div>
      <div className="space-y-7">
        {rows.map((row, i) => (
          <div key={row.label}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="max-w-[22rem] text-[0.875rem] leading-snug text-site-text-muted">{row.label}</span>
              <span className="tnum font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-site-text">
                {nl(row.value)}
              </span>
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-site-surface-3">
              <div
                className="h-3 rounded-full transition-[width] duration-[900ms] ease-out"
                style={{
                  width: `${(row.value / max) * 100}%`,
                  backgroundColor: row.tone === "blue" ? "#1F5AFF" : "#A3ABB8",
                  transitionDelay: `${i * 160}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-card border border-site-line bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelLabel>Verschil</PanelLabel>
          <span className="tnum font-mono text-[0.8125rem] text-site-blue">
            {nl(gap)} conversies · {REPORTING_GAP.periodLabel}
          </span>
        </div>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-site-text-muted">
          Niet omdat een systeem liegt, maar omdat elk systeem hetzelfde resultaat aan zichzelf
          toeschrijft. De vraag welk deel van die orders er zónder media ook was geweest, stelt geen
          van beide rapportages.
        </p>
      </div>
    </div>
  );
}

/** Stand 3: wat er te verklaren valt — media is één factor, en niet de grootste. */
function ExplainedStage() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <PanelLabel>Waar komt het resultaat vandaan?</PanelLabel>
        <span className="font-mono text-[11px] text-site-text-faint">geschat, 209 weken</span>
      </div>

      <div className="mt-4 flex h-16 w-full gap-[2px] overflow-hidden rounded-[10px]">
        {DECOMPOSITION.map((part, i) => (
          <div
            key={part.label}
            className="flex min-w-0 flex-col justify-center overflow-hidden px-3 transition-[width] duration-[900ms] ease-out first:rounded-l-[10px] last:rounded-r-[10px]"
            style={{
              width: `${part.value}%`,
              backgroundColor: part.accent ? "#1F5AFF" : i === 0 ? "#E9EDF3" : i === 2 ? "#CBD1DA" : "#A3ABB8",
              transitionDelay: `${i * 90}ms`,
            }}
          >
            <span className={`truncate font-mono text-[10px] ${part.accent ? "text-white/75" : "text-site-text/55"}`}>
              {part.label}
            </span>
            <span className={`tnum text-[0.9375rem] font-medium ${part.accent ? "text-white" : "text-site-text"}`}>
              {nl(part.value)}%
            </span>
          </div>
        ))}
      </div>

      <ul className="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {DECOMPOSITION.map((part) => (
          <li key={part.label} className="flex items-baseline gap-2 text-[0.8125rem] text-site-text-muted">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${part.accent ? "bg-site-blue" : "bg-site-text-faint/50"}`} />
            <span>
              <span className="text-site-text">{part.label}</span> — {part.note}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-7 rounded-card border border-site-line bg-white px-4 py-4 sm:px-5">
        <p className="text-[0.875rem] leading-relaxed text-site-text-muted">
          Pas als die andere factoren apart zijn meegewogen, blijft er een geschatte bijdrage van
          media over — en die valt vervolgens uiteen over je kanalen.
        </p>
        <div className="mt-4 flex h-8 w-full gap-[2px] overflow-hidden rounded-[8px]">
          {["Shopping", "Search", "TV", "Social", "Radio & overig"].map((label, i) => (
            <div
              key={label}
              className="flex min-w-0 items-center justify-center overflow-hidden first:rounded-l-[8px] last:rounded-r-[8px]"
              style={{ width: `${[26, 19, 24, 15, 16][i]}%`, backgroundColor: EFFECT_STEPS[i] }}
            >
              <span className={`truncate px-1 font-mono text-[10px] ${i < 3 ? "text-white/85" : "text-site-text/65"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
