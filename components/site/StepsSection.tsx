import { STEPS } from "@/lib/site/copy";
import { Anim, Reveal } from "./motion";
import { Container, Label, Section, SectionHead } from "./primitives";

/**
 * Hoe het werkt, in drie stappen. Bewust kort: de bezoeker hoeft de methode niet te
 * begrijpen, hij moet zien dat er een route is van data naar besluit.
 */
export function StepsSection() {
  return (
    <Section labelledBy="stappen-titel">
      <Container>
        <Reveal>
          <SectionHead
            id="stappen-titel"
            watermark="Werkwijze"
            label="Hoe het werkt"
            title="Meten, begrijpen,"
            accent="beslissen."
            intro="Drie stappen, van je bestaande data naar een budgetverdeling die je kunt uitleggen."
          />
        </Reveal>

        <Anim className="mt-14 grid gap-4 md:grid-cols-3 md:gap-5">
          {STEPS.map((step, i) => (
            <article
              key={step.number}
              className="site-stagger u-card group relative flex flex-col p-6 transition-shadow duration-300 hover:shadow-site-md sm:p-8"
              style={{ ["--d" as string]: `${i * 110}ms` }}
            >
              <span className="u-label text-site-green-text">{step.number}</span>
              <h3 className="u-display u-h3 mt-5 text-site-ink">{step.title}</h3>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-site-muted">{step.body}</p>

              {/* Voortgangsstreepje: vult zich bij hover — de enige decoratie in dit blok. */}
              <span aria-hidden="true" className="mt-8 block h-[3px] rounded-full bg-site-paper-3">
                <span
                  className="block h-[3px] w-0 rounded-full transition-[width] duration-700 ease-out group-hover:w-full"
                  style={{ background: "linear-gradient(90deg,#2E9E50,#8511D9)" }}
                />
              </span>
            </article>
          ))}
        </Anim>

        <Reveal delay={120}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {["Data", "Model", "Media-effect", "Scenario", "Beslissing"].map((node, i, all) => (
              <span key={node} className="flex items-center gap-3">
                <span className={`u-pill ${i === all.length - 1 ? "u-pill-violet" : ""} u-label-sm text-site-ink`}>
                  {node}
                </span>
                {i < all.length - 1 && (
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 text-site-muted-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                )}
              </span>
            ))}
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
