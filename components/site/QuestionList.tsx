import { MANAGEMENT_QUESTIONS } from "@/lib/site/copy";
import { Reveal } from "./Reveal";

/**
 * De waarde, uitgedrukt in de vragen die de bezoeker zelf al stelt. Geen featurelijst: vijf
 * managementvragen, elk met één antwoord dat eindigt bij een beslissing. Native
 * <details>/<summary>, dus toegankelijk en werkend zonder JavaScript.
 */
export function QuestionList() {
  return (
    <section className="border-t border-site-line" aria-labelledby="vragen-titel">
      <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
        <Reveal>
          <h2
            id="vragen-titel"
            className="max-w-3xl font-display text-[clamp(1.875rem,4vw,3rem)] leading-[1.1] tracking-tight text-site-text"
          >
            Vragen waar je daarna een onderbouwd antwoord op hebt.
          </h2>
        </Reveal>

        <div className="mt-12 border-t border-site-line">
          {MANAGEMENT_QUESTIONS.map((item, index) => (
            <Reveal key={item.question} delay={index * 60}>
              <details className="group border-b border-site-line py-6">
                <summary className="flex cursor-pointer list-none items-baseline gap-5 text-site-text marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="tnum shrink-0 pt-1 text-sm text-site-text-faint">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-display text-[clamp(1.25rem,2.6vw,1.875rem)] leading-snug tracking-tight">
                    {item.question}
                  </span>
                  <span
                    aria-hidden="true"
                    className="ml-auto shrink-0 pt-2 text-site-text-faint transition-transform duration-200 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-4 max-w-2xl pl-10 text-base leading-relaxed text-site-text-muted">
                  {item.answer}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
