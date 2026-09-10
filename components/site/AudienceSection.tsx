import { AUDIENCE } from "@/lib/site/copy";
import { Anim, Reveal } from "./motion";
import { Container, Label, Section } from "./primitives";

/**
 * Hoofdstuk 8 — voor wie dit relevant is. Kort en zonder verkoopdruk: wie zich hier niet in
 * herkent, heeft er waarschijnlijk ook niets aan.
 */
export function AudienceSection() {
  return (
    <Section labelledBy="doelgroep-titel">
      <Container>
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,38rem)]">
          <Reveal>
            <Label>Hoofdstuk 07 · voor wie</Label>
            <h2 id="doelgroep-titel" className="u-display u-h2 mt-5 max-w-[18ch] text-site-ink">
              Voor teams die serieus
              <br />
              <span className="u-grad">budget willen sturen.</span>
            </h2>
            <p className="u-sub mt-6">
              Media Mix Modeling is vooral interessant wanneer je marketingbudget groot genoeg is om
              er echte keuzes in te maken, en je genoeg historie hebt om die keuzes te onderbouwen.
            </p>
          </Reveal>

          <Anim>
            <ul className="space-y-3">
              {AUDIENCE.map((item, i) => (
                <li
                  key={item}
                  className="site-stagger flex gap-3.5 text-[1rem] leading-relaxed text-site-muted"
                  style={{ ["--d" as string]: `${i * 70}ms` }}
                >
                  <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-site-green-text" />
                  {item}
                </li>
              ))}
            </ul>

            <p className="mt-8 border-t border-site-line pt-6 text-[0.9375rem] leading-relaxed text-site-ink">
              Geen extra dashboard om naar te kijken. Een ander perspectief op de data die je al
              hebt.
            </p>
          </Anim>
        </div>
      </Container>
    </Section>
  );
}
