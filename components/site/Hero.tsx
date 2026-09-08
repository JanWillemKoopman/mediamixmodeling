import { EXAMPLE_LABEL } from "@/lib/site/exampleData";
import { hasPhoto } from "@/lib/site/photos";
import { Photo } from "./Photo";
import { SITE } from "@/lib/site/copy";
import { BudgetBar } from "./BudgetBar";
import { Reveal } from "./Reveal";
import { shareSentence, spendSegments } from "./segments";

/**
 * De opening. Eén zin die het probleem opent, en de helft van de metafoor: de balk met je
 * mediabudget. De tweede balk — het geschatte effect — houden we bewust achter tot de
 * bezoeker de vraag heeft gezien waar die balk het antwoord op is.
 */
export function Hero() {
  const spend = spendSegments();
  const withPhoto = hasPhoto("hero");

  return (
    <section className="mx-auto max-w-[80rem] px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24 lg:px-12">
      <div
        className={
          withPhoto
            ? "grid items-end gap-12 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_22rem]"
            : ""
        }
      >
        <div className="max-w-4xl">
        <h1 className="font-display text-[clamp(2.75rem,8vw,5.5rem)] leading-[1.02] tracking-tight text-site-text">
          Weet wat je mediabudget doet.
        </h1>
        <p className="mt-7 max-w-2xl text-[clamp(1.0625rem,1.6vw,1.375rem)] leading-relaxed text-site-text-muted">
          Je weet hoeveel je uitgeeft en wat je advertentieplatforms rapporteren. Maar weet je ook
          welk effect je mediabestedingen daadwerkelijk hebben op je resultaat?
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <a
            href="#demo"
            className="inline-flex items-center justify-center rounded-full bg-site-effect px-7 py-3.5 text-base font-medium text-white transition hover:bg-site-effect-hover"
          >
            {SITE.ctaPrimary}
          </a>
          <a
            href="#voorbeeldanalyse"
            className="inline-flex items-center justify-center rounded-full border border-site-line-strong px-7 py-3.5 text-base text-site-text transition hover:bg-site-sand"
          >
            {SITE.ctaSecondary}
          </a>
        </div>
        </div>

        {withPhoto && (
          <Photo
            slot="hero"
            priority
            sizes="(min-width: 1280px) 22rem, (min-width: 1024px) 18rem, 100vw"
          />
        )}
      </div>

      <figure className="mt-16 sm:mt-24">
        <Reveal>
          <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-xs uppercase tracking-[0.14em] text-site-text-faint">
            <span>Je mediabudget, verdeeld over je kanalen</span>
            <span className="normal-case tracking-normal">{EXAMPLE_LABEL}</span>
          </figcaption>
          <BudgetBar
            segments={spend}
            className="mt-3"
            srSummary={shareSentence("Verdeling van het mediabudget in dit voorbeeld", spend)}
          />
          <p className="mt-4 text-sm text-site-text-muted">
            Dit is waar je geld staat. Het zegt nog niets over wat het doet.
          </p>
        </Reveal>
      </figure>
    </section>
  );
}
