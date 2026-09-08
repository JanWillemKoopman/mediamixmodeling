import { Reveal } from "./Reveal";
import { SpendEffectFigure } from "./SpendEffectFigure";

/**
 * Hier wordt de oplossing geïntroduceerd — als inzicht, niet als product. Pas onderaan deze
 * sectie valt voor het eerst het woord Media Mix Modeling, klein en feitelijk: de methode
 * achter de analyse, niet de belofte.
 */
export function Insight() {
  return (
    <section
      id="voorbeeldanalyse"
      className="site-anchor border-t border-site-line bg-site-sand"
      aria-labelledby="inzicht-titel"
    >
      <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
        <Reveal>
          <div className="max-w-3xl">
            <h2
              id="inzicht-titel"
              className="font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.08] tracking-tight text-site-text"
            >
              Maak het effect van je mediabudget zichtbaar.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-site-text-muted">
              We leggen je mediabestedingen naast je eigen resultaatcijfers, week voor week, over
              meerdere jaren. Daar hoort alles bij wat je resultaat verder beweegt: prijs, promoties,
              seizoen, marktomstandigheden. Uit dat geheel komt een schatting van wat je media
              hebben bijgedragen — met de marge die daarbij hoort.
            </p>
          </div>
        </Reveal>

        <SpendEffectFigure />

        <Reveal delay={80}>
          <p className="mt-14 max-w-2xl border-t border-site-line pt-6 text-sm leading-relaxed text-site-text-faint">
            De methode erachter: we gebruiken Media Mix Modeling om de relatie tussen
            mediabestedingen, bedrijfsresultaat en andere relevante factoren te analyseren. Je hoeft
            er niets van te weten om de uitkomst te kunnen gebruiken.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
