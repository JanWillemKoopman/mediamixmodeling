import { SHIFT } from "@/lib/site/copy";
import { EFFECT_STEPS } from "@/lib/site/exampleData";
import { Anim, Reveal } from "./motion";
import { Container, PanelLabel, Section, SectionHead } from "./primitives";

/**
 * Sectie 07 — de verschuiving die de site verkoopt: van losse campagnerapportage naar één
 * geïntegreerd beeld. Bewust compact; het beeld doet het werk, niet de tekst.
 */
export function ShiftSection() {
  return (
    <Section tone="canvas" labelledBy="verschuiving-titel">
      <Container>
        <Reveal>
          <SectionHead
            id="verschuiving-titel"
            eyebrow="De verschuiving"
            title="Van cijfers naar een onderbouwde keuze."
            intro="Rapportage vertelt je wat er gebeurd is, per kanaal, in de taal van dat kanaal. Een geïntegreerd beeld vertelt je wat je media samen lijken bij te dragen — en wat dat betekent voor je volgende budget."
          />
        </Reveal>

        <Anim className="mt-12 grid gap-4 sm:mt-16 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch lg:gap-6">
          {/* Oud: waar de meeste teams nu staan. Bewust grijs en vlak. */}
          <div className="site-stagger rounded-panel border border-site-line bg-site-surface-2 p-6 sm:p-8">
            <PanelLabel>Vandaag</PanelLabel>
            <h3 className="mt-3 font-display text-xl font-semibold tracking-[-0.02em] text-site-text-muted">
              {SHIFT.old.label}
            </h3>
            <p className="mt-1.5 text-[0.875rem] text-site-text-faint">{SHIFT.old.caption}</p>
            <ul className="mt-6 space-y-2.5">
              {SHIFT.old.items.map((item) => (
                <li key={item} className="flex items-center gap-3 text-[0.9375rem] text-site-text-muted">
                  <span aria-hidden="true" className="h-px w-4 shrink-0 bg-site-text-faint/50" />
                  {item}
                </li>
              ))}
            </ul>

            {/* Vijf losse maatstaven, elk op een eigen schaal: niets telt op. */}
            <div aria-hidden="true" className="mt-8 flex gap-2">
              {[62, 34, 78, 45, 25].map((v, i) => (
                <span key={i} className="h-1.5 flex-1 rounded-full bg-site-surface-3">
                  <span className="block h-1.5 rounded-full bg-site-text-faint/45" style={{ width: `${v}%` }} />
                </span>
              ))}
            </div>
          </div>

          {/* De overgang zelf. */}
          <div className="site-stagger flex items-center justify-center lg:px-2" style={{ ["--d" as string]: "160ms" }}>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-site-line bg-white text-site-blue shadow-site-card"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4 rotate-90 lg:rotate-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </div>

          {/* Nieuw: waar het gesprek over budget naartoe gaat. */}
          <div
            className="site-stagger rounded-panel border border-site-blue/20 bg-white p-6 shadow-site-lift sm:p-8"
            style={{ ["--d" as string]: "280ms" }}
          >
            <PanelLabel>Met media-effect</PanelLabel>
            <h3 className="mt-3 font-display text-xl font-semibold tracking-[-0.02em] text-site-text">
              {SHIFT.next.label}
            </h3>
            <p className="mt-1.5 text-[0.875rem] text-site-text-muted">{SHIFT.next.caption}</p>
            <ul className="mt-6 space-y-2.5">
              {SHIFT.next.items.map((item) => (
                <li key={item} className="flex items-center gap-3 text-[0.9375rem] text-site-text">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-site-blue" />
                  {item}
                </li>
              ))}
            </ul>

            {/* Eén balk, één schaal: dezelfde kanalen, nu vergelijkbaar. */}
            <div aria-hidden="true" className="mt-8 flex h-1.5 gap-[2px] overflow-hidden rounded-full">
              {EFFECT_STEPS.map((color, i) => (
                <span
                  key={color}
                  className="h-1.5 first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${[26, 19, 24, 15, 16][i]}%`, backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </Anim>
      </Container>
    </Section>
  );
}
