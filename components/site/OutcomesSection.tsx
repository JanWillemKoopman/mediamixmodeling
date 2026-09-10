import { OUTCOMES } from "@/lib/site/copy";
import { Anim, Reveal } from "./motion";
import { Container, Label, Section, SectionHead } from "./primitives";

/**
 * Hoofdstuk 6 — wat de analyse uiteindelijk oplevert. Bewust geen vijf losse USP-kaartjes maar
 * één opsomming die als verhaal doorloopt, met de afsluitende zin waar het hele stuk naartoe
 * werkt: meten is niet alleen terugkijken.
 */
export function OutcomesSection() {
  return (
    <Section id="inzichten" labelledBy="inzichten-titel">
      <Container>
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,38rem)]">
          <Reveal>
            <SectionHead
              id="inzichten-titel"
              watermark="Inzicht"
              label="Hoofdstuk 05 · de opbrengst"
              title="Van mediadata naar beter"
              accent="onderbouwde beslissingen."
              intro="Media Mix Modeling levert geen lijst met scores op, maar vijf dingen die samen één beeld vormen van wat je marketing doet — en van hoe zeker dat beeld is."
            />
          </Reveal>

          <Anim>
            <ul className="divide-y divide-site-line border-y border-site-line">
              {OUTCOMES.map((outcome, i) => (
                <li
                  key={outcome.number}
                  className="site-stagger flex gap-5 py-6"
                  style={{ ["--d" as string]: `${i * 90}ms` }}
                >
                  <span className="u-label mt-1 shrink-0 text-site-green-text">{outcome.number}</span>
                  <span className="min-w-0">
                    <span className="block text-[1.0625rem] font-bold tracking-[-0.015em] text-site-ink">
                      {outcome.title}
                    </span>
                    <span className="mt-2 block text-[0.9375rem] leading-relaxed text-site-muted">
                      {outcome.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Anim>
        </div>

        <Reveal delay={120}>
          <p className="u-display u-h3 mt-14 max-w-4xl text-site-ink">
            Zo wordt marketingmeting niet alleen een manier om terug te kijken, maar een hulpmiddel
            om vooruit te kijken en betere budgetbeslissingen te nemen.
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
