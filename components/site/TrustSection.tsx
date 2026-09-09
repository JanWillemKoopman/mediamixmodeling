import { TRUST_PRINCIPLES } from "@/lib/site/copy";
import { CHANNELS } from "@/lib/site/exampleData";
import { euroShort } from "@/lib/site/format";
import { Anim, Reveal } from "./motion";
import { Container, Label, Section, SectionHead } from "./primitives";

/**
 * Onzekerheid als kenmerk, niet als excuus. Links het statement en het verschil in beeld —
 * één getal zonder marge naast dezelfde schatting mét marge — rechts de drie principes.
 */
export function TrustSection() {
  const tv = CHANNELS[2];

  return (
    <Section id="onzekerheid" labelledBy="onzekerheid-titel">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-20">
          <Reveal>
            <SectionHead
              id="onzekerheid-titel"
              watermark="Marge"
              label="Onzekerheid"
              title="Een schatting met een eerlijke marge"
              accent="verslaat valse precisie."
              intro="Een goed model laat niet alleen zien wat de meest waarschijnlijke bijdrage is, maar ook hoeveel onzekerheid daaromheen zit. Dat maakt de uitkomst bruikbaar in een gesprek over budget."
            />

            <Anim className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
              <div className="site-stagger u-tile p-5">
                <Label tone="muted">Valse precisie</Label>
                <p className="tnum mt-3 text-[1.6rem] font-extrabold leading-none tracking-[-0.03em] text-site-muted-2">
                  € 1.712.480
                </p>
                <span aria-hidden="true" className="relative mt-4 block h-4">
                  <span className="absolute inset-x-0 top-[7px] h-px bg-site-line" />
                  <span className="absolute left-1/2 top-0 h-4 w-[2px] rounded-full bg-site-muted-2" />
                </span>
                <p className="mt-3 text-[0.82rem] leading-snug text-site-muted-2">
                  Precies genoeg voor een slide. Te precies om te kloppen.
                </p>
              </div>

              <div className="site-stagger u-tile p-5" style={{ ["--d" as string]: "120ms" }}>
                <Label>Eerlijke schatting</Label>
                <p className="tnum mt-3 text-[1.6rem] font-extrabold leading-none tracking-[-0.03em] text-site-ink">
                  {euroShort(tv.contribution)}
                </p>
                <span aria-hidden="true" className="relative mt-4 block h-4">
                  <span className="absolute inset-x-0 top-[7px] h-px bg-site-line" />
                  <span className="absolute left-[18%] top-0 h-4 w-[64%] rounded-[4px] bg-site-green-soft" />
                  <span className="absolute left-1/2 top-0 h-4 w-[2px] rounded-full bg-site-green-text" />
                </span>
                <p className="mt-3 text-[0.82rem] leading-snug text-site-muted">
                  Bandbreedte {euroShort(tv.low)} – {euroShort(tv.high)}. Zegt hetzelfde, plus hoeveel
                  gewicht je eraan mag hangen.
                </p>
              </div>
            </Anim>
          </Reveal>

          <Anim>
            <ul className="u-card divide-y divide-site-line overflow-hidden">
              {TRUST_PRINCIPLES.map((principle, i) => (
                <li key={principle.number} className="site-stagger p-6" style={{ ["--d" as string]: `${i * 110}ms` }}>
                  <span className="flex items-baseline gap-3">
                    <span className="u-label text-site-violet">{principle.number}</span>
                    <span className="text-[1rem] font-bold tracking-[-0.01em] text-site-ink">{principle.title}</span>
                  </span>
                  <p className="mt-2.5 pl-[2.4rem] text-[0.875rem] leading-relaxed text-site-muted">
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
