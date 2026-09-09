import { CHANNELS, EXAMPLE_CASE, EXAMPLE_LABEL_LONG, EXAMPLE_PROFILE, SCENARIO, TOTAL_BUDGET, estimateScenario } from "@/lib/site/exampleData";
import { SITE } from "@/lib/site/copy";
import { euroShort, signedPct } from "@/lib/site/format";
import { Anim, Reveal } from "./motion";
import { Button, Container, Label, Section, SectionHead } from "./primitives";

/**
 * De voorbeeldcase: van wat de platforms rapporteerden, via de geschatte bijdrage, naar één
 * besluit over het volgende mediaplan. Nadrukkelijk geen klantresultaat — dat staat er twee
 * keer bij, en de cijfers komen uit de synthetische dataset.
 */
export function CaseSection() {
  const estimate = estimateScenario(SCENARIO.initial);
  const shifted = (TOTAL_BUDGET * SCENARIO.initial) / 100;

  return (
    <Section id="voorbeeld" labelledBy="case-titel">
      <Container>
        <Reveal>
          <SectionHead
            id="case-titel"
            watermark="Voorbeeld"
            label={EXAMPLE_LABEL_LONG}
            title="Wat gebeurt er als je"
            accent="je budget anders verdeelt?"
            intro="Eén doorlopend voorbeeld op een synthetische dataset: het profiel, wat de analyse liet zien, het besluit dat eruit volgde en wat daarvan verwacht werd."
          />
        </Reveal>

        <Anim className="mt-14 grid gap-4 lg:grid-cols-12 lg:gap-5">
          {/* Profiel. */}
          <div className="site-stagger u-card p-5 sm:p-7 lg:col-span-4">
            <Label tone="muted">Profiel</Label>
            <p className="mt-5 text-[1.0625rem] font-bold leading-snug tracking-[-0.01em] text-site-ink">
              {EXAMPLE_PROFILE.sector}
            </p>
            <dl className="mt-6 space-y-3.5">
              {[
                [EXAMPLE_PROFILE.budget, EXAMPLE_PROFILE.budgetLabel],
                [EXAMPLE_PROFILE.channels, EXAMPLE_PROFILE.channelsLabel],
                [EXAMPLE_PROFILE.weeks, EXAMPLE_PROFILE.weeksLabel],
              ].map(([value, label]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 border-b border-site-line pb-3 last:border-b-0">
                  <dt className="text-[0.875rem] text-site-muted">{label}</dt>
                  <dd className="tnum font-mono text-[0.875rem] font-semibold text-site-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Wat de analyse liet zien. */}
          <div className="site-stagger u-card p-5 sm:p-7 lg:col-span-8" style={{ ["--d" as string]: "120ms" }}>
            <Label tone="muted">Wat de analyse liet zien</Label>
            <ol className="mt-6 grid gap-6 sm:grid-cols-3">
              {EXAMPLE_CASE.findings.map((finding, i) => (
                <li key={finding.title}>
                  <span className="u-label text-site-green-text">0{i + 1}</span>
                  <h3 className="mt-3 text-[0.9375rem] font-bold leading-snug tracking-[-0.01em] text-site-ink">
                    {finding.title}
                  </h3>
                  <p className="mt-2.5 text-[0.85rem] leading-relaxed text-site-muted">{finding.body}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Rapportage versus schatting, per kanaal. */}
          <div className="site-stagger u-card overflow-hidden lg:col-span-7" style={{ ["--d" as string]: "220ms" }}>
            <div className="border-b border-site-line px-5 py-4">
              <Label tone="muted">Rapportage naast geschatte bijdrage</Label>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem]">
              <thead>
                <tr className="border-b border-site-line">
                  {["Kanaal", "Rapportage", "Besteding", "Geschatte bijdrage"].map((head, i) => (
                    <th
                      key={head}
                      scope="col"
                      className={`u-label-sm u-label px-5 py-3 text-site-muted-2 ${i === 0 ? "text-left" : "text-right"}`}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CHANNELS.map((channel) => (
                  <tr key={channel.key} className="border-b border-site-line last:border-b-0">
                    <th scope="row" className="px-5 py-3 text-left text-[0.875rem] font-semibold text-site-ink">
                      {channel.label}
                    </th>
                    <td className="tnum px-5 py-3 text-right font-mono text-[0.78rem] text-site-muted">{channel.reported}</td>
                    <td className="tnum px-5 py-3 text-right font-mono text-[0.78rem] text-site-muted">{euroShort(channel.spend)}</td>
                    <td className="tnum px-5 py-3 text-right font-mono text-[0.78rem] font-semibold text-site-ink">
                      {euroShort(channel.contribution)}
                      <span className="ml-2 font-normal text-site-muted-2">
                        {euroShort(channel.low)}–{euroShort(channel.high)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Besluit en verwachte uitkomst. */}
          <div className="site-stagger flex flex-col gap-4 lg:col-span-5" style={{ ["--d" as string]: "320ms" }}>
            <div className="u-card flex-1 p-5 sm:p-7">
              <Label tone="muted">Het besluit</Label>
              <p className="mt-4 text-[1.0625rem] font-semibold leading-snug tracking-[-0.015em] text-site-ink">
                {EXAMPLE_CASE.decision}
              </p>
              <p className="tnum mt-5 font-mono text-[0.8rem] text-site-muted">
                {SCENARIO.initial}% van het budget = {euroShort(shifted)}
              </p>
            </div>

            <div className="u-card u-card-md bg-[rgba(185,239,163,0.22)] p-5 sm:p-7">
              <Label>Geschat effect op omzet</Label>
              <p className="tnum mt-3 text-[clamp(1.9rem,3.4vw,2.5rem)] font-extrabold leading-none tracking-[-0.04em] text-site-ink">
                {signedPct(estimate.low)} <span className="text-site-muted-2">→</span> {signedPct(estimate.high)}
              </p>
              <p className="mt-3 text-[0.85rem] leading-relaxed text-site-muted">
                Bandbreedte bij gelijkblijvend totaalbudget. De mogelijkheid dat het effect klein
                blijft, zit er nadrukkelijk in.
              </p>
            </div>
          </div>
        </Anim>

        {/* Conversiemoment halverwege: de bezoeker heeft het hele verhaal net gezien. */}
        <Reveal delay={80}>
          <div className="u-card mt-5 flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center sm:px-7">
            <p className="max-w-xl text-[1.0625rem] font-medium leading-snug text-site-ink">
              Benieuwd hoe dit beeld eruitziet voor jouw kanalen en jouw resultaatcijfers?
            </p>
            <Button href="#demo" arrow className="shrink-0">
              {SITE.ctaPrimary}
            </Button>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
