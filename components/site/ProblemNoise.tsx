import { Reveal } from "./Reveal";

// Wat er wél wordt gerapporteerd — en de ene regel die eronder ontbreekt. De opsomming is
// bewust gewoon, want dat is precies het punt: al deze cijfers zijn beschikbaar, alleen het
// antwoord op de vraag van de directie niet.
const REPORTED = [
  "ROAS · Meta",
  "CPA · Search",
  "Conversies · Shopping",
  "Weergaven · YouTube",
  "Bereik · TV",
  "Sessies en kliks · GA4",
];

export function ProblemNoise() {
  return (
    <section className="border-t border-site-line bg-site-sand" aria-labelledby="probleem-titel">
      <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-20">
          <Reveal>
            <h2
              id="probleem-titel"
              className="font-display text-[clamp(1.875rem,4vw,3rem)] leading-[1.1] tracking-tight text-site-text"
            >
              Geen gebrek aan cijfers. Wel aan een totaalbeeld.
            </h2>
            <p className="mt-6 text-base leading-relaxed text-site-text-muted">
              Elk kanaal rapporteert zijn eigen succes. Elk dashboard heeft zijn eigen waarheid. Tel
              je alles bij elkaar op, dan komt er een resultaat uit dat je in je eigen cijfers
              nergens terugziet.
            </p>
            <p className="mt-4 text-base leading-relaxed text-site-text-muted">
              Het probleem is niet dat je te weinig weet over je kanalen. Het is dat niemand
              rapporteert wat je media samen met je resultaat doen.
            </p>
          </Reveal>

          <Reveal delay={120} className="self-center">
            <dl className="border-t border-site-line">
              {REPORTED.map((metric) => (
                <div
                  key={metric}
                  className="flex items-baseline justify-between gap-6 border-b border-site-line py-3.5"
                >
                  <dt className="text-base text-site-text-muted">{metric}</dt>
                  <dd className="text-sm text-site-text-faint">gerapporteerd</dd>
                </div>
              ))}
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pt-7">
                <dt className="font-display text-[clamp(1.375rem,2.8vw,2rem)] leading-tight tracking-tight text-site-text">
                  Effect van je media op de omzet
                </dt>
                <dd className="text-base font-medium text-site-accent-text">niet gerapporteerd</dd>
              </div>
            </dl>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
