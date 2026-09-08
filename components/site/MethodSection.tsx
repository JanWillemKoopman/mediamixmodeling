import { METHOD_STEPS } from "@/lib/site/copy";
import { Anim, Reveal } from "./motion";
import { Container, PanelLabel, Section, SectionHead } from "./primitives";

/**
 * Sectie 10 — pas hier de methode. De bezoeker hoeft de techniek niet te begrijpen; hij moet
 * kunnen vertrouwen dat er een serieuze analyse onder ligt. Vier stappen, één lijn: data,
 * analyse, inzicht, beslissing.
 */
export function MethodSection() {
  return (
    <Section id="methode" tone="canvas" labelledBy="methode-titel">
      <Container wide>
        <Reveal>
          <SectionHead
            id="methode-titel"
            eyebrow="Methode"
            title="Onderbouwd met Media Mix Modeling."
            intro="Media Mix Modeling is de analysemethode achter de inzichten. We analyseren de relatie tussen mediabestedingen, bedrijfsresultaat en andere relevante factoren over een langere periode. Je hoeft geen econometrist te zijn om ermee te werken — wel om het goed te doen."
          />
        </Reveal>

        <Anim className="mt-12 sm:mt-16">
          <ol className="grid gap-px overflow-hidden rounded-panel border border-site-line bg-site-line md:grid-cols-2 lg:grid-cols-4">
            {METHOD_STEPS.map((step, i) => (
              <li
                key={step.number}
                className="site-stagger group relative bg-white p-6 transition-colors duration-300 hover:bg-site-canvas sm:p-7"
                style={{ ["--d" as string]: `${i * 110}ms` }}
              >
                <div className="flex items-center justify-between">
                  <PanelLabel>{step.number}</PanelLabel>
                  {i < METHOD_STEPS.length - 1 && (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5 rotate-90 text-site-line-strong transition-colors duration-300 group-hover:text-site-blue lg:rotate-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  )}
                </div>

                <h3 className="mt-5 font-display text-xl font-semibold tracking-[-0.02em] text-site-text">
                  {step.title}
                </h3>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-site-text-muted">{step.body}</p>
                <p className="mt-5 border-t border-site-line pt-4 text-[0.8125rem] text-site-text-faint">
                  {step.note}
                </p>

                {/* Onderlijn die de stap markeert bij hover — het enige sieraad hier. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-site-blue transition-transform duration-500 group-hover:scale-x-100"
                />
              </li>
            ))}
          </ol>
        </Anim>
      </Container>
    </Section>
  );
}
