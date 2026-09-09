import { SITE } from "@/lib/site/copy";
import { HeroFlow } from "./HeroFlow";
import { Reveal } from "./motion";
import { Button, Container, Label } from "./primitives";

/**
 * Hoofdstuk 1 — de vraag die iedere marketingverantwoordelijke zou moeten kunnen
 * beantwoorden. Links de vraag en wat we eraan doen, rechts meteen het beeld van de
 * redenering: budget, kanalen, resultaat, geschatte bijdrage.
 */
export function Hero() {
  return (
    <section id="top" className="u-wash relative isolate overflow-hidden bg-site-paper pb-16 pt-28 sm:pb-20 lg:pb-24 lg:pt-36 2xl:pt-44">
      <Container className="relative">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-16 2xl:grid-cols-[minmax(0,1fr)_minmax(0,42rem)]">
          <div className="min-w-0">
            <Reveal>
              <Label>Media Mix Modeling</Label>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="u-display mt-6 max-w-[16ch] text-[clamp(2.2rem,4vw,3.6rem)] text-site-ink">
                Weet wat je
                <br />
                <span className="u-grad">mediabudget doet.</span>
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="u-sub mt-7">
                Je weet hoeveel je uitgeeft. Je weet hoeveel clicks, leads, orders en omzet je
                advertentieplatforms rapporteren. Maar weet je ook hoeveel je totale mediabudget
                daadwerkelijk bijdraagt aan je bedrijfsresultaat?
              </p>
            </Reveal>

            <Reveal delay={160}>
              <p className="u-sub mt-5">
                Media Mix Modeling brengt je mediabestedingen, bedrijfsresultaat en andere factoren
                samen in één analyse. Zo krijg je inzicht in de geschatte bijdrage van je marketing
                en kun je beter onderbouwde keuzes maken over je volgende mediabudget.
              </p>
            </Reveal>

            <Reveal delay={210}>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button href="#demo" arrow>
                  {SITE.ctaPrimary}
                </Button>
                <Button href="#model" variant="ghost" arrow>
                  {SITE.ctaSecondary}
                </Button>
              </div>
            </Reveal>

            <Reveal delay={260}>
              <p className="mt-8 text-[0.875rem] leading-relaxed text-site-muted-2">
                {SITE.taglineTop}
                <br />
                {SITE.taglineBottom}
              </p>
            </Reveal>
          </div>

          <Reveal delay={180} className="min-w-0">
            <HeroFlow />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
