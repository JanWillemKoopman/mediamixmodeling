import { HOW_IT_WORKS } from "@/lib/site/copy";
import { Reveal } from "./Reveal";

/**
 * Vier stappen, bedoeld om onzekerheid weg te nemen: dit is behapbaar, en het begint bij
 * cijfers die je al hebt. De methodische noot staat klein onderaan elke stap — informatie
 * voor wie erom vraagt, geen hoofdroute.
 */
export function HowItWorks() {
  return (
    <section id="aanpak" className="site-anchor border-t border-site-line" aria-labelledby="aanpak-titel">
      <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
        <Reveal>
          <h2
            id="aanpak-titel"
            className="max-w-3xl font-display text-[clamp(1.875rem,4vw,3rem)] leading-[1.1] tracking-tight text-site-text"
          >
            Vier stappen, van je eigen cijfers naar een onderbouwde keuze.
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-site-text-muted">
            Het meeste werk zit in de eerste stap. Daarna gaat het gesprek niet meer over data,
            maar over keuzes.
          </p>
        </Reveal>

        <ol className="mt-14 space-y-px">
          {HOW_IT_WORKS.map((item, index) => (
            <li key={item.title} className="border-t border-site-line">
              <Reveal delay={index * 70} className="grid gap-x-8 gap-y-3 py-8 sm:grid-cols-[4rem_minmax(0,14rem)_minmax(0,1fr)] sm:py-10">
                <p className="tnum font-display text-2xl text-site-text-faint">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="font-display text-[clamp(1.375rem,2.4vw,1.75rem)] leading-tight tracking-tight text-site-text">
                  {item.title}
                </h3>
                <div>
                  <p className="max-w-xl text-base leading-relaxed text-site-text-muted">{item.body}</p>
                  <p className="mt-3 text-sm text-site-text-faint">{item.note}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
