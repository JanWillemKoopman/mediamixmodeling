import { TRUST_PRINCIPLES } from "@/lib/site/copy";
import { Anim, Reveal } from "./motion";
import { Container, Eyebrow, PanelLabel, Section } from "./primitives";

/**
 * Sectie 11 — onzekerheid als kenmerk, niet als excuus. Eén statement, drie principes.
 * Compact gehouden: dit is een vertrouwenskaart, geen college.
 */
export function TrustSection() {
  return (
    <Section tone="surface" labelledBy="vertrouwen-titel">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16">
          <Reveal>
            <Eyebrow>Onzekerheid</Eyebrow>
            <h2
              id="vertrouwen-titel"
              className="mt-5 max-w-2xl font-display text-[clamp(1.75rem,3.6vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-site-text"
            >
              Een schatting met een eerlijke marge is meer waard dan een cijfer met valse precisie.
            </h2>
            <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-site-text-muted">
              Modeluitkomsten zijn schattingen. Ze zijn bedoeld om een beslissing te onderbouwen, niet
              om als waarheid te worden gepresenteerd. Daarom staat bij elk resultaat hoe zeker het is
              — en waar de analyse geen uitspraak over kan doen.
            </p>

            {/* Het verschil, in beeld: één getal zonder marge zegt minder dan een eerlijk bereik. */}
            <div className="mt-10 max-w-lg overflow-hidden rounded-panel border border-site-line bg-site-canvas">
              <div className="border-b border-site-line px-5 py-5">
                <PanelLabel>Valse precisie</PanelLabel>
                <p className="tnum mt-2 font-display text-2xl font-semibold tracking-[-0.02em] text-site-text-muted">
                  24,68%
                </p>
                <div className="relative mt-3 h-4">
                  <div className="absolute inset-x-0 top-[7px] h-px bg-site-line-strong" />
                  <div className="absolute top-0 h-4 w-[2px] rounded-full bg-site-text-faint" style={{ left: "52%" }} />
                </div>
                <p className="mt-2.5 text-[0.8125rem] text-site-text-faint">
                  Precies genoeg om in een slide te zetten. Te precies om te kloppen.
                </p>
              </div>
              <div className="px-5 py-5">
                <PanelLabel>Eerlijke schatting</PanelLabel>
                <p className="tnum mt-2 font-display text-2xl font-semibold tracking-[-0.02em] text-site-text">
                  16–32%
                </p>
                <div className="relative mt-3 h-4">
                  <div className="absolute inset-x-0 top-[7px] h-px bg-site-line-strong" />
                  <div className="absolute top-0 h-4 rounded-[4px] bg-site-blue/25" style={{ left: "34%", width: "34%" }} />
                  <div className="absolute top-0 h-4 w-[2px] rounded-full bg-site-blue" style={{ left: "52%" }} />
                </div>
                <p className="mt-2.5 text-[0.8125rem] text-site-text-muted">
                  Zegt hetzelfde, plus hoeveel gewicht je eraan mag hangen.
                </p>
              </div>
            </div>
          </Reveal>

          <Anim>
            <ul className="space-y-px overflow-hidden rounded-panel border border-site-line bg-site-line">
              {TRUST_PRINCIPLES.map((principle, i) => (
                <li
                  key={principle.number}
                  className="site-stagger bg-white p-5 sm:p-6"
                  style={{ ["--d" as string]: `${i * 120}ms` }}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-[11px] tabular-nums text-site-blue">{principle.number}</span>
                    <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-site-text">
                      {principle.title}
                    </h3>
                  </div>
                  <p className="mt-2.5 pl-[1.9rem] text-[0.875rem] leading-relaxed text-site-text-muted">
                    {principle.body}
                  </p>
                </li>
              ))}
            </ul>
          </Anim>
        </div>
      </Container>
    </Section>
  );
}
