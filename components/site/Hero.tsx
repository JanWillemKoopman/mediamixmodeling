import { SITE } from "@/lib/site/copy";
import { HeroConsole } from "./HeroConsole";
import { Reveal } from "./motion";
import { Button, Container, Label } from "./primitives";

/**
 * De opening: links de belofte in vier regels, rechts meteen het product. Geen illustratie,
 * geen abstract beeld — het paneel ernaast is de eerste demonstratie dat hier software
 * achter zit. De kop staat in kapitalen met de tweede regel in het kleurverloop; dat patroon
 * loopt door over de hele site.
 */
export function Hero() {
  return (
    <section id="top" className="u-wash relative isolate overflow-hidden bg-site-paper pb-16 pt-28 sm:pb-20 lg:pb-24 lg:pt-36 2xl:pt-44">
      <Container className="relative">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,38rem)] lg:gap-14 2xl:grid-cols-[minmax(0,1fr)_minmax(0,48rem)]">
          <div className="min-w-0">
            <Reveal>
              <Label>Media-effect · budgetbeslissingen</Label>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="u-display mt-6 max-w-[17ch] text-[clamp(2.2rem,3.9vw,3.5rem)] text-site-ink">
                Weet wat je
                <br />
                <span className="u-grad">mediabudget doet.</span>
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="u-sub mt-7">
                Je weet hoeveel je uitgeeft en wat je advertentieplatforms rapporteren. Maar weet je
                ook welk effect je mediabestedingen daadwerkelijk hebben op je resultaat?
              </p>
            </Reveal>

            <Reveal delay={180}>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button href="#demo" arrow>
                  {SITE.ctaPrimary}
                </Button>
                <Button href="#voorbeeld" variant="ghost" arrow>
                  {SITE.ctaSecondary}
                </Button>
              </div>
            </Reveal>

            <Reveal delay={240}>
              <p className="mt-8 text-[0.8125rem] leading-relaxed text-site-muted-2">
                Van mediabestedingen naar media-effect. Van media-effect naar betere
                budgetbeslissingen.
              </p>
            </Reveal>
          </div>

          <Reveal delay={160} className="min-w-0">
            <HeroConsole />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
