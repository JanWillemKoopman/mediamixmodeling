import { PROCESS } from "@/lib/site/copy";
import { TOTAL_BUDGET } from "@/lib/site/exampleData";
import { nl } from "@/lib/site/format";
import { Anim, Reveal } from "./motion";
import { Container, Label, Section, SectionHead } from "./primitives";

/**
 * Hoofdstuk 7 — de werkwijze, en die mag juist kort. Eén horizontale route waarin hetzelfde
 * bedrag van links naar rechts door het proces beweegt, met daaronder vijf stappen in één
 * zin per stap.
 */
export function ProcessSection() {
  return (
    <Section id="werkwijze" wash labelledBy="werkwijze-titel">
      <Container>
        <Reveal>
          <SectionHead
            id="werkwijze-titel"
            watermark="Werkwijze"
            label="Hoofdstuk 06 · zo werkt het"
            title="Van je eigen data naar"
            accent="een onderbouwde budgetkeuze."
            intro="Geen implementatietraject en geen nieuw dashboard. We werken met de data die je al hebt."
          />
        </Reveal>

        {/* De route: één bedrag dat door het proces beweegt. */}
        <Reveal delay={100}>
          <Anim className="u-card u-card-md mt-14 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-site-line px-5 py-4 sm:px-7">
              <Label tone="muted">De route van één mediabudget</Label>
              <span className="tnum font-mono text-[0.8125rem] font-semibold text-site-ink">
                € {nl(TOTAL_BUDGET)}
              </span>
            </div>

            <ol className="flex flex-col gap-3 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
              {PROCESS.map((step, i) => (
                <li
                  key={step.node}
                  className="site-stagger flex items-center gap-3 lg:flex-1"
                  style={{ ["--d" as string]: `${i * 110}ms` }}
                >
                  <span
                    className={`u-pill u-label-sm flex-1 justify-center lg:flex-none ${
                      i === PROCESS.length - 1 ? "u-pill-violet" : "text-site-ink"
                    }`}
                  >
                    {step.node}
                  </span>
                  {i < PROCESS.length - 1 && (
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 rotate-90 text-site-muted-2 lg:rotate-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  )}
                </li>
              ))}
            </ol>

            <p className="border-t border-site-line px-5 py-4 text-center text-[0.9375rem] font-semibold text-site-ink sm:px-7">
              Waar moet de volgende euro naartoe?
            </p>
          </Anim>
        </Reveal>

        {/* De vijf stappen, één zin per stap. */}
        <Anim className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
          {PROCESS.map((step, i) => (
            <article
              key={step.number}
              className="site-stagger u-tile p-5"
              style={{ ["--d" as string]: `${i * 90}ms` }}
            >
              <span className="u-label text-site-green-text">{step.number}</span>
              <h3 className="mt-3 text-[0.9375rem] font-bold tracking-[-0.01em] text-site-ink">{step.title}</h3>
              <p className="mt-2.5 text-[0.85rem] leading-relaxed text-site-muted">{step.body}</p>
            </article>
          ))}
        </Anim>
      </Container>
    </Section>
  );
}
