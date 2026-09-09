import { PLATFORM_REPORTS } from "@/lib/site/exampleData";
import { Anim, Reveal } from "./motion";
import { Container, ExampleTag, Label, Section, SectionHead } from "./primitives";

/**
 * Hoofdstuk 2 — waarom die vraag vandaag moeilijk te beantwoorden is. Hier mag de tekst zijn
 * werk doen: de klantreis is versnipperd, elk systeem registreert een ander deel, en de
 * cijfers die eruit komen zijn niet bij elkaar op te tellen. De visual eronder zet de losse
 * rapportages naast de vraag die geen van alle beantwoordt.
 */
export function MeasurementSection() {
  return (
    <Section id="meten" labelledBy="meten-titel">
      <Container>
        <Reveal>
          <SectionHead
            id="meten-titel"
            watermark="Meten"
            label="Hoofdstuk 01 · de meetvraag"
            title="Je hebt meer marketingdata dan ooit."
            accent="Toch zie je het totaalbeeld niet."
          />
        </Reveal>

        <div className="mt-10 grid gap-x-16 gap-y-6 lg:grid-cols-2">
          <Reveal delay={60}>
            <div className="space-y-5 text-[1.0625rem] leading-relaxed text-site-muted">
              <p>
                Marketing bestaat allang niet meer uit een paar campagnes en een handvol kanalen.
                Een klant kan vandaag een YouTube-video zien, morgen via Google zoeken, een week
                later een social-advertentie tegenkomen en uiteindelijk in een fysieke winkel een
                aankoop doen. Ondertussen kunnen prijsacties, promoties, seizoen, concurrentie en
                economische omstandigheden het resultaat beïnvloeden.
              </p>
              <p>
                En ieder systeem registreert daar weer een ander deel van. Google kijkt naar wat er
                binnen Google gebeurt. Meta kijkt naar wat Meta kan toeschrijven. Je analytics kijkt
                naar websitegedrag, je CRM registreert klanten en orders, en offline verkoop staat
                mogelijk in weer een ander systeem.
              </p>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="space-y-5 text-[1.0625rem] leading-relaxed text-site-muted">
              <p>
                Dat levert veel cijfers op. Maar veel cijfers zijn nog geen antwoord op de
                belangrijkste vraag: wat heeft ons totale mediabudget bijgedragen aan ons
                bedrijfsresultaat?
              </p>
              <p>
                Platformrapportages zijn waardevol. Ze helpen je begrijpen wat er binnen een kanaal
                of platform gebeurt. Maar dat is iets anders dan het beoordelen van je totale
                marketinginvestering. Als ieder systeem een deel van hetzelfde resultaat aan
                zichzelf toeschrijft, kun je die cijfers niet zomaar bij elkaar optellen.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={160}>
          <Anim className="u-card u-card-md mt-14 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-site-line px-5 py-4 sm:px-7">
              <Label tone="muted">Wat de systemen apart rapporteren</Label>
              <ExampleTag />
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              {/* Links: vier bronnen, elk met een eigen blikveld en eigen maatstaven. */}
              <div className="grid gap-px bg-site-line sm:grid-cols-2 lg:border-r lg:border-site-line">
                {PLATFORM_REPORTS.map((report, i) => (
                  <article
                    key={report.source}
                    className="site-stagger bg-site-paper px-5 py-5"
                    style={{ ["--d" as string]: `${i * 90}ms` }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-[0.9375rem] font-bold tracking-[-0.01em] text-site-ink">{report.source}</h3>
                      <span className="u-label-sm u-label text-site-muted-2">bron {i + 1}</span>
                    </div>
                    <p className="mt-1 text-[0.8125rem] text-site-muted-2">{report.scope}</p>
                    <dl className="mt-4 space-y-1.5">
                      {report.metrics.map((metric) => (
                        <div key={metric.label} className="flex items-baseline justify-between gap-3 border-b border-site-line pb-1.5 last:border-b-0">
                          <dt className="text-[0.8125rem] text-site-muted">{metric.label}</dt>
                          <dd className="tnum font-mono text-[0.8125rem] font-semibold text-site-ink">{metric.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>

              {/* Rechts: de vraag die geen van die bronnen beantwoordt. */}
              <div className="flex flex-col justify-center bg-site-paper-2/70 px-5 py-8 sm:px-7">
                <span className="site-fade block" style={{ ["--d" as string]: "500ms" }}>
                  <Label tone="muted">Allemaal nuttige informatie</Label>
                  <p className="mt-4 text-[1.125rem] font-bold leading-snug tracking-[-0.015em] text-site-ink">
                    Maar niet bij elkaar op te tellen: elk systeem schrijft een deel van hetzelfde
                    resultaat aan zichzelf toe.
                  </p>

                  <span className="mt-7 block h-px w-full bg-site-line" />

                  <Label className="mt-7">De vraag die overblijft</Label>
                  <p className="u-display u-h3 mt-4 text-site-ink">
                    Wat heeft ons totale mediabudget bijgedragen aan het resultaat?
                  </p>
                  <p className="mt-5 text-[0.9375rem] leading-relaxed text-site-muted">
                    Daarvoor is geen negende rapportage nodig, maar één geïntegreerd beeld.
                  </p>
                </span>
              </div>
            </div>
          </Anim>
        </Reveal>
      </Container>
    </Section>
  );
}
