"use client";

import { useState } from "react";
import { CHANNELS, DECISIONS, EFFECT_STEPS, SCENARIO, estimateScenario } from "@/lib/site/exampleData";
import { nl, signedPct } from "@/lib/site/format";
import { Reveal } from "./motion";
import { Container, ExampleTag, PanelBar, Section, SectionHead } from "./primitives";

/**
 * Sectie 06 — het scharnierpunt van de site. Niet de analyse is het product, maar de
 * beslissing die erdoor mogelijk wordt. Vijf vragen die een budgetverantwoordelijke
 * daadwerkelijk stelt; bij elke vraag verschijnt rechts het stukje product dat hem
 * beantwoordt.
 */
export function DecisionsSection() {
  const [active, setActive] = useState(0);
  const item = DECISIONS[active];

  return (
    <Section id="beslissingen" tone="surface" labelledBy="beslissingen-titel">
      <Container wide>
        <Reveal>
          <SectionHead
            id="beslissingen-titel"
            eyebrow="Van inzicht naar beslissing"
            title="Van inzicht naar betere budgetbeslissingen."
            intro="De analyse is het middel. Waar het om gaat, is dat je de vragen kunt beantwoorden waar je mediaplan op vastloopt — en dat je je antwoord kunt uitleggen."
          />
        </Reveal>

        <div className="mt-12 grid gap-8 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-14">
          {/* De vijf vragen. Klikken (of tabben) wisselt de visualisatie ernaast. */}
          <Reveal>
            <ul className="border-t border-site-line">
              {DECISIONS.map((decision, i) => {
                const isActive = i === active;
                return (
                  <li key={decision.id} className="border-b border-site-line">
                    <button
                      type="button"
                      onClick={() => setActive(i)}
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      aria-expanded={isActive}
                      className="group flex w-full items-start gap-4 py-5 text-left sm:gap-6"
                    >
                      <span
                        className={`mt-0.5 font-mono text-[11px] tabular-nums transition-colors duration-300 ${
                          isActive ? "text-site-blue" : "text-site-text-faint"
                        }`}
                      >
                        {decision.number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block font-display text-[1.0625rem] font-medium leading-snug tracking-[-0.01em] transition-colors duration-300 sm:text-[1.1875rem] ${
                            isActive ? "text-site-text" : "text-site-text-muted group-hover:text-site-text"
                          }`}
                        >
                          {decision.question}
                        </span>
                        {/* Het antwoord staat er alleen bij de actieve vraag — de rest blijft rustig. */}
                        <span
                          className="grid transition-[grid-template-rows,opacity] duration-500 ease-out"
                          style={{ gridTemplateRows: isActive ? "1fr" : "0fr", opacity: isActive ? 1 : 0 }}
                        >
                          <span className="overflow-hidden">
                            <span className="block max-w-xl pt-2.5 text-[0.9375rem] leading-relaxed text-site-text-muted">
                              {decision.answer}
                            </span>
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Reveal>

          {/* Het bijbehorende stukje product. Blijft op desktop meescrollen. */}
          <Reveal delay={80}>
            <div className="lg:sticky lg:top-24">
              <div className="overflow-hidden rounded-panel border border-site-line bg-site-canvas shadow-site-card">
                <PanelBar title={item.readout} right={<ExampleTag>Voorbeeld</ExampleTag>} />
                <div key={item.id} className="site-reveal is-in min-h-[19rem] px-4 py-6 sm:px-6">
                  <DecisionViz viz={item.viz} />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

function DecisionViz({ viz }: { viz: (typeof DECISIONS)[number]["viz"] }) {
  if (viz === "contribution") return <ContributionMini />;
  if (viz === "headroom") return <HeadroomMini />;
  if (viz === "scenario") return <ScenarioMini />;
  if (viz === "compare") return <CompareMini />;
  return <PlanMini />;
}

const DOMAIN = 40;
const w = (v: number) => `${(v / DOMAIN) * 100}%`;

/** 01 — geschatte bijdrage met bandbreedte. */
function ContributionMini() {
  return (
    <ul className="space-y-4">
      {CHANNELS.map((channel, i) => (
        <li key={channel.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[0.875rem] text-site-text">{channel.label}</span>
            <span className="tnum font-mono text-[0.8125rem] text-site-text">
              {nl(channel.effectShare)}%
              <span className="ml-2 text-site-text-faint">
                {nl(channel.effectLow)}–{nl(channel.effectHigh)}%
              </span>
            </span>
          </div>
          <div className="relative mt-2 h-3">
            <div className="absolute inset-x-0 top-1 h-1 rounded-full bg-site-surface-3" />
            <div
              className="absolute top-0 h-3 rounded-[3px] transition-all duration-700 ease-out"
              style={{
                left: w(channel.effectLow),
                width: w(channel.effectHigh - channel.effectLow),
                backgroundColor: EFFECT_STEPS[i],
                opacity: 0.3,
              }}
            />
            <div
              className="absolute top-0 h-3 w-[3px] rounded-full transition-all duration-700 ease-out"
              style={{ left: w(channel.effectShare), backgroundColor: EFFECT_STEPS[i] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 02 — waar staat het geld, en waar zit het effect? Het verschil is de ruimte. */
function HeadroomMini() {
  return (
    <ul className="space-y-4">
      {CHANNELS.map((channel, i) => {
        const delta = channel.effectShare - channel.spendShare;
        return (
          <li key={channel.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.875rem] text-site-text">{channel.label}</span>
              <span
                className={`tnum font-mono text-[0.8125rem] ${
                  delta > 1 ? "text-site-blue" : delta < -1 ? "text-site-text-muted" : "text-site-text-faint"
                }`}
              >
                {delta > 0 ? "+" : ""}
                {nl(delta)} pt
              </span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full rounded-full bg-site-surface-3">
                <div className="h-1.5 rounded-full bg-site-text-faint/60 transition-all duration-700 ease-out" style={{ width: w(channel.spendShare) }} />
              </div>
              <div className="h-1.5 w-full rounded-full bg-site-surface-3">
                <div
                  className="h-1.5 rounded-full transition-all duration-700 ease-out"
                  style={{ width: w(channel.effectShare), backgroundColor: EFFECT_STEPS[i] }}
                />
              </div>
            </div>
          </li>
        );
      })}
      <li className="flex items-center gap-4 pt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-site-text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-site-text-faint/60" /> budget
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-site-blue" /> geschat effect
        </span>
      </li>
    </ul>
  );
}

/** 03 — het scenario in het klein: één verschuiving, één bereik. */
function ScenarioMini() {
  const estimate = estimateScenario(SCENARIO.initial);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-card border border-site-line bg-white px-4 py-3">
        <span className="text-[0.875rem] text-site-text-muted">{SCENARIO.fromLabel}</span>
        <span aria-hidden="true" className="font-mono text-[0.8125rem] text-site-blue">
          → {SCENARIO.initial}% →
        </span>
        <span className="text-[0.875rem] text-site-text-muted">{SCENARIO.toLabel}</span>
      </div>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-site-text-faint">
        Geschat effect op omzet
      </p>
      <p className="tnum mt-2 font-display text-[2.25rem] font-semibold leading-none tracking-[-0.03em] text-site-blue">
        {signedPct(estimate.low)} <span className="text-site-text-faint">→</span> {signedPct(estimate.high)}
      </p>
      <p className="mt-3 text-[0.875rem] leading-relaxed text-site-text-muted">
        Een bereik, geen belofte. Wordt de verschuiving groter, dan wordt het bereik breder.
      </p>

      <div className="mt-6 space-y-2.5">
        {[6, 12, 18].map((s) => {
          const e = estimateScenario(s);
          return (
            <div key={s} className="flex items-center gap-3">
              <span className="tnum w-10 font-mono text-[11px] text-site-text-faint">{s}%</span>
              <span className="relative h-2 flex-1 rounded-full bg-site-surface-3">
                <span
                  className="absolute h-2 rounded-full bg-site-blue/30"
                  style={{ left: `${((e.low + 2) / 8) * 100}%`, width: `${((e.high - e.low) / 8) * 100}%` }}
                />
                <span
                  className="absolute h-2 w-[2px] rounded-full bg-site-blue"
                  style={{ left: `${((e.mid + 2) / 8) * 100}%` }}
                />
              </span>
              <span className="tnum w-24 text-right font-mono text-[11px] text-site-text-muted">
                {signedPct(e.low)}…{signedPct(e.high)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[11px] text-site-text-faint">Illustratief scenario. Geen voorspelling.</p>
    </div>
  );
}

/** 04 — dezelfde maatstaf voor elk kanaal, gesorteerd. */
function CompareMini() {
  const sorted = [...CHANNELS].sort((a, b) => b.effectShare / b.spendShare - a.effectShare / a.spendShare);
  return (
    <div>
      <p className="text-[0.875rem] leading-relaxed text-site-text-muted">
        Bijdrage gedeeld door budgetaandeel. Boven de 1,0 draagt een kanaal naar schatting meer bij
        dan zijn aandeel in het budget.
      </p>
      <ul className="mt-5 space-y-3.5">
        {sorted.map((channel) => {
          const ratio = channel.effectShare / channel.spendShare;
          return (
            <li key={channel.key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-[0.875rem] text-site-text">{channel.label}</span>
              <span className="relative h-6 flex-1">
                <span className="absolute inset-y-0 left-1/2 w-px bg-site-line-strong" />
                <span
                  className="absolute top-1.5 h-3 rounded-[3px] transition-all duration-700 ease-out"
                  style={
                    ratio >= 1
                      ? { left: "50%", width: `${Math.min((ratio - 1) * 50, 50)}%`, backgroundColor: "#1F5AFF" }
                      : { right: "50%", width: `${Math.min((1 - ratio) * 50, 50)}%`, backgroundColor: "#A3ABB8" }
                  }
                />
              </span>
              <span className="tnum w-10 text-right font-mono text-[0.8125rem] text-site-text">
                {nl(ratio, 1)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.1em] text-site-text-faint">
        1,0 = bijdrage gelijk aan budgetaandeel
      </p>
    </div>
  );
}

/** 05 — van aanname naar toetsing: het plan wordt een afspraak. */
function PlanMini() {
  const steps = [
    { label: "Aanname", body: "Verschuiving van 12% naar TV en radio." },
    { label: "Verwachting", body: "Geschat effect +0,8% tot +4,2% omzet." },
    { label: "Meetperiode", body: "26 weken, vooraf vastgelegd." },
    { label: "Toetsing", body: "Volgende analyse beoordeelt de aanname." },
  ];
  return (
    <ol className="relative space-y-6 border-l border-site-line pl-6">
      {steps.map((step, i) => (
        <li key={step.label} className="relative">
          <span
            aria-hidden="true"
            className={`absolute -left-[1.6875rem] top-1.5 h-2 w-2 rounded-full ${
              i === 0 ? "bg-site-blue" : "border border-site-line-strong bg-white"
            }`}
          />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-site-text-faint">{step.label}</p>
          <p className="mt-1 text-[0.9375rem] leading-snug text-site-text">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
