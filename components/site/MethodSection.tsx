import { METHOD_QUESTIONS } from "@/lib/site/copy";
import { Anim, Reveal } from "./motion";
import { Container, Label, Section, SectionHead } from "./primitives";

/**
 * Pas hier de methode, en niet eerder. De bezoeker hoeft de techniek niet te begrijpen; hij
 * moet kunnen vertrouwen dat er een serieuze analyse onder ligt en zien welke vragen die
 * beantwoordt. Geen college econometrie.
 */
export function MethodSection() {
  return (
    <Section id="methode" wash labelledBy="methode-titel">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-20">
          <Reveal>
            <SectionHead
              id="methode-titel"
              watermark="Methode"
              label="De methode erachter"
              title="Onderbouwd met"
              accent="Media Mix Modeling."
              intro="Media Mix Modeling gebruikt historische marketing-, media- en bedrijfsdata om te schatten welke bijdrage je mediakanalen hebben geleverd aan je resultaat. Het werkt zonder cookies en zonder toegang tot persoonsgegevens: de analyse draait op geaggregeerde cijfers per week."
            />
          </Reveal>

          <Anim>
            <div className="u-card u-card-md p-6 sm:p-8">
              <Label tone="muted">Vragen die de analyse beantwoordt</Label>
              <ul className="mt-6 divide-y divide-site-line border-y border-site-line">
                {METHOD_QUESTIONS.map((question, i) => (
                  <li
                    key={question}
                    className="site-stagger flex items-start gap-4 py-4"
                    style={{ ["--d" as string]: `${i * 90}ms` }}
                  >
                    <span className="u-label mt-1 shrink-0 text-site-green-text">0{i + 1}</span>
                    <span className="text-[0.9375rem] leading-snug text-site-ink">{question}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[0.85rem] leading-relaxed text-site-muted">
                Je hoeft geen econometrist te zijn om met de uitkomsten te werken. Wel om ze goed te
                maken — daar zijn wij voor.
              </p>
            </div>
          </Anim>
        </div>
      </Container>
    </Section>
  );
}
