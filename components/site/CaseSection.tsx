import {
  CHANNELS,
  EFFECT_STEPS,
  EXAMPLE_CASE,
  EXAMPLE_LABEL_LONG,
  EXAMPLE_PROFILE,
  SCENARIO,
  estimateScenario,
} from "@/lib/site/exampleData";
import { nl, signedPct } from "@/lib/site/format";
import { Anim, Reveal } from "./motion";
import { Container, PanelLabel, Section, SectionHead } from "./primitives";

/**
 * Sectie 08 — de voorbeeldcase. Laat in één doorlopend verhaal zien hoe rapportage,
 * gemodelleerde bijdrage, beslissing en verwachte uitkomst zich tot elkaar verhouden.
 * Nadrukkelijk geen klantresultaat: dat staat er twee keer bij, en de cijfers komen uit de
 * voorbeelddataset.
 */
export function CaseSection() {
  const estimate = estimateScenario(SCENARIO.initial);

  return (
    <Section id="voorbeeld" tone="canvas" labelledBy="case-titel">
      <Container wide>
        <Reveal>
          <SectionHead
            id="case-titel"
            eyebrow="Voorbeeldanalyse"
            title="Wat gebeurt er als je je budget anders verdeelt?"
            intro="Eén doorlopend voorbeeld: van wat de platforms rapporteerden, via de geschatte bijdrage per kanaal, naar een besluit over het volgende mediaplan."
          />
        </Reveal>

        <Reveal delay={100} className="mt-12 sm:mt-16">
          <Anim className="overflow-hidden rounded-panel border border-site-line bg-white shadow-site-card">
            {/* Waarschuwingsregel, bovenaan en niet weg te kijken. */}
            <div className="flex items-center gap-2.5 border-b border-site-line bg-site-surface-2 px-4 py-3 sm:px-6">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-site-text-faint" />
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-site-text-muted">
                {EXAMPLE_LABEL_LONG}
              </p>
            </div>

            {/* Profiel van het voorbeeldbedrijf. */}
            <dl className="grid grid-cols-2 gap-px border-b border-site-line bg-site-line lg:grid-cols-4">
              {[
                { label: "Profiel", value: "Retail", sub: EXAMPLE_PROFILE.sector },
                { label: "Mediabudget", value: EXAMPLE_PROFILE.budgetLabel, sub: EXAMPLE_PROFILE.budgetSub },
                { label: "Kanalen", value: EXAMPLE_PROFILE.channelsLabel, sub: EXAMPLE_PROFILE.channelsSub },
                { label: "Historie", value: EXAMPLE_PROFILE.historyLabel, sub: EXAMPLE_PROFILE.historySub },
              ].map((item, i) => (
                <div key={item.label} className="site-stagger bg-white px-4 py-5 sm:px-6" style={{ ["--d" as string]: `${i * 90}ms` }}>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-site-text-faint">
                    {item.label}
                  </dt>
                  <dd className="mt-2 font-display text-xl font-semibold tracking-[-0.02em] text-site-text">
                    {item.value}
                  </dd>
                  <dd className="mt-1 text-[0.8125rem] leading-snug text-site-text-muted">{item.sub}</dd>
                </div>
              ))}
            </dl>

            {/* Rapportage naast gemodelleerde bijdrage: hetzelfde budget, twee beelden. */}
            <div className="grid lg:grid-cols-2">
              <div className="border-b border-site-line px-4 py-6 sm:px-6 sm:py-8 lg:border-b-0 lg:border-r">
                <PanelLabel>Wat de platforms rapporteerden</PanelLabel>
                <ul className="mt-5 space-y-3">
                  {CHANNELS.map((channel) => (
                    <li key={channel.key} className="flex items-baseline justify-between gap-3 border-b border-site-line pb-3 last:border-b-0">
                      <span className="text-[0.9375rem] text-site-text-muted">{channel.label}</span>
                      <span className="tnum font-mono text-[0.875rem] text-site-text">{channel.platformMetric}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-[0.875rem] leading-relaxed text-site-text-faint">
                  Vijf maatstaven uit vijf systemen. Onderling niet vergelijkbaar, en geen van alle een
                  uitspraak over het totaal.
                </p>
              </div>

              <div className="px-4 py-6 sm:px-6 sm:py-8">
                <PanelLabel>Wat de analyse schatte</PanelLabel>
                <ul className="mt-5 space-y-3">
                  {CHANNELS.map((channel, i) => (
                    <li key={channel.key} className="border-b border-site-line pb-3 last:border-b-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[0.9375rem] text-site-text">{channel.label}</span>
                        <span className="tnum font-mono text-[0.875rem] text-site-text">
                          {nl(channel.effectShare)}%
                          <span className="ml-2 text-site-text-faint">
                            {nl(channel.effectLow)}–{nl(channel.effectHigh)}%
                          </span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-site-surface-3">
                        <div
                          className="site-bar h-1.5 rounded-full"
                          style={{
                            ["--w" as string]: `${(channel.effectShare / 40) * 100}%`,
                            ["--w0" as string]: `${(channel.spendShare / 40) * 100}%`,
                            ["--d" as string]: `${i * 90}ms`,
                            backgroundColor: EFFECT_STEPS[i],
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-[0.875rem] leading-relaxed text-site-text-muted">
                  Eén maatstaf over alle kanalen en alle 209 weken, met bandbreedte — en met prijs,
                  promotie en seizoen apart meegewogen.
                </p>
              </div>
            </div>

            {/* Wat de analyse liet zien. */}
            <div className="grid gap-px border-t border-site-line bg-site-line lg:grid-cols-3">
              {EXAMPLE_CASE.findings.map((finding, i) => (
                <div key={finding.title} className="site-stagger bg-white px-4 py-6 sm:px-6" style={{ ["--d" as string]: `${i * 110}ms` }}>
                  <span className="font-mono text-[11px] tabular-nums text-site-blue">0{i + 1}</span>
                  <h3 className="mt-3 font-display text-[1.0625rem] font-semibold leading-snug tracking-[-0.01em] text-site-text">
                    {finding.title}
                  </h3>
                  <p className="mt-2.5 text-[0.875rem] leading-relaxed text-site-text-muted">{finding.body}</p>
                </div>
              ))}
            </div>

            {/* Het besluit en de verwachte uitkomst. */}
            <div className="grid border-t border-site-line lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <div className="px-4 py-6 sm:px-6 sm:py-8">
                <PanelLabel>De beslissing</PanelLabel>
                <p className="mt-4 max-w-2xl font-display text-[1.25rem] font-medium leading-snug tracking-[-0.02em] text-site-text sm:text-[1.375rem]">
                  {EXAMPLE_CASE.decision}
                </p>
              </div>

              <div className="border-t border-site-line bg-site-blue-soft px-4 py-6 sm:px-6 sm:py-8 lg:border-l lg:border-t-0">
                <PanelLabel>{EXAMPLE_CASE.outcomeLabel}</PanelLabel>
                <p className="tnum mt-3 font-display text-[2rem] font-semibold leading-none tracking-[-0.03em] text-site-blue">
                  {signedPct(estimate.low)} <span className="text-site-blue/40">→</span> {signedPct(estimate.high)}
                </p>
                <p className="mt-3 text-[0.875rem] leading-relaxed text-site-text-muted">
                  {EXAMPLE_CASE.outcomeNote}
                </p>
              </div>
            </div>

            <p className="border-t border-site-line px-4 py-4 text-[0.8125rem] text-site-text-faint sm:px-6">
              Alle cijfers in dit voorbeeld komen uit een synthetische dataset en zijn niet gebaseerd
              op klantdata.
            </p>
          </Anim>
        </Reveal>
      </Container>
    </Section>
  );
}
