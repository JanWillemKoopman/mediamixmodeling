import { SITE } from "@/lib/site/copy";
import { HeroConsole } from "./HeroConsole";
import { Reveal } from "./motion";
import { Button, Container, Eyebrow } from "./primitives";

/**
 * De opening. Eén belofte, één zin die de bezoeker in zijn eigen situatie herkent, twee
 * acties — en dan meteen het product. Geen marketingbeeld: het paneel eronder is de eerste
 * demonstratie dat hier software achter zit.
 */
export function Hero() {
  return (
    <section id="top" className="site-glow relative overflow-hidden bg-site-canvas pt-14 sm:pt-20 lg:pt-24">
      {/* Technisch raster achter de opening, vervaagd aan de randen. */}
      <div aria-hidden="true" className="site-grid-light site-grid-mask absolute inset-x-0 top-0 h-[42rem] opacity-70" />

      <Container wide className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal className="flex justify-center">
            <Eyebrow>Media-effect &amp; budgetbeslissingen</Eyebrow>
          </Reveal>

          <Reveal delay={60}>
            <h1 className="mt-6 font-display text-[clamp(2.5rem,7vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-site-text">
              Weet wat je mediabudget doet.
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mx-auto mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-site-text-muted sm:text-[1.125rem]">
              Je weet hoeveel je uitgeeft en wat je advertentieplatforms rapporteren. Maar weet je
              ook welk effect je mediabestedingen daadwerkelijk hebben op je resultaat?
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="#demo" className="w-full sm:w-auto" arrow>
                {SITE.ctaPrimary}
              </Button>
              <Button href="#aanpak" variant="secondary" className="w-full sm:w-auto">
                {SITE.ctaSecondary}
              </Button>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <p className="mt-6 text-[0.8125rem] text-site-text-faint">
              Van mediabestedingen naar media-effect. Van media-effect naar betere budgetbeslissingen.
            </p>
          </Reveal>
        </div>

        <Reveal delay={200} className="mt-14 sm:mt-16 lg:mt-20">
          <HeroConsole />
        </Reveal>
      </Container>
    </section>
  );
}
