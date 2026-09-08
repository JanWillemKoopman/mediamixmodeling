import { PROOF_SLOTS } from "@/lib/site/copy";
import { Anim, Reveal } from "./motion";
import { Container, PanelLabel, Section, SectionHead } from "./primitives";

/**
 * Sectie 09 — bewijs. Er staan hier bewust geen logo's, quotes of resultaten: die verzinnen
 * we niet. Wat er wel staat, is precies wat een echte case straks laat zien — de indeling is
 * al gebouwd, de inhoud volgt zodra een klant akkoord geeft.
 */
export function ProofSection() {
  return (
    <Section tone="surface" labelledBy="bewijs-titel">
      <Container>
        <Reveal>
          <SectionHead
            id="bewijs-titel"
            eyebrow="Bewijs"
            title="Echte data. Onderbouwde beslissingen."
            intro="We publiceren geen resultaten die we niet kunnen onderbouwen, en geen klantnamen zonder toestemming. Zodra een analyse is afgerond en de klant akkoord geeft, verschijnt hier de volledige case — met wat er is besloten en wat er daarna is gemeten."
          />
        </Reveal>

        <Anim className="mt-12 sm:mt-14">
          <ul className="grid gap-px overflow-hidden rounded-panel border border-site-line bg-site-line sm:grid-cols-2 lg:grid-cols-3">
            {PROOF_SLOTS.map((slot, i) => (
              <li
                key={slot.label}
                className="site-stagger bg-white px-5 py-6"
                style={{ ["--d" as string]: `${i * 80}ms` }}
              >
                <PanelLabel>{slot.label}</PanelLabel>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-site-text-muted">{slot.body}</p>
                <p aria-hidden="true" className="mt-4 h-px w-8 bg-site-line-strong" />
              </li>
            ))}
          </ul>
        </Anim>

        <Reveal delay={120}>
          <p className="mt-6 text-[0.875rem] leading-relaxed text-site-text-faint">
            Tot die tijd werken we met een openbare voorbeeldanalyse op een synthetische dataset. Wil
            je zien hoe zo'n analyse er voor jouw kanalen uitziet, dan lopen we hem in een demo met je
            door.
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
