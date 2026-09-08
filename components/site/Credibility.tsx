import {
  CHANNELS,
  EXAMPLE_CASE,
  EXAMPLE_LABEL,
  MEASUREMENT_WINDOW,
  METHOD_FACTS,
} from "@/lib/site/exampleData";
import { nl } from "@/lib/site/format";
import { WeekField } from "./WeekField";
import { Reveal } from "./Reveal";

const AXIS_MAX = 36;
const toAxis = (value: number) => (value / AXIS_MAX) * 100;

/**
 * Vertrouwen wordt hier opgebouwd met twee dingen: wat we over de werkwijze kunnen hardmaken,
 * en een uitgewerkte voorbeeldcase. Die case is nadrukkelijk gelabeld als voorbeeld — zolang
 * er geen klant is die met naam en cijfers naar buiten wil, is een geloofwaardige illustratie
 * eerlijker dan een echt ogende referentie.
 */
export function Credibility() {
  return (
    <section className="border-t border-site-line" aria-labelledby="vertrouwen-titel">
      <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
        <Reveal>
          <h2
            id="vertrouwen-titel"
            className="max-w-3xl font-display text-[clamp(1.875rem,4vw,3rem)] leading-[1.1] tracking-tight text-site-text"
          >
            Een schatting met een eerlijke marge is meer waard dan een cijfer met valse precisie.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-3">
          {METHOD_FACTS.map((fact, index) => (
            <Reveal key={fact.value} delay={index * 70}>
              <div className="border-t border-site-line-strong pt-5">
                <p className="font-display text-[clamp(1.5rem,2.6vw,2rem)] leading-tight tracking-tight text-site-text">
                  {fact.value}
                </p>
                <p className="mt-1 text-sm text-site-text-muted">{fact.label}</p>
                <p className="mt-3 text-sm leading-relaxed text-site-text-faint">{fact.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* De marge, letterlijk getoond: per kanaal het geschatte aandeel én het bereik eromheen. */}
        <Reveal delay={80}>
          <figure className="mt-20 border-t border-site-line pt-12">
            <figcaption className="max-w-2xl text-base leading-relaxed text-site-text-muted">
              Zo ziet een uitkomst eruit: per kanaal het geschatte aandeel in de door media
              verklaarde omzet, met het bereik waarbinnen die schatting waarschijnlijk ligt.
            </figcaption>

            <ul className="mt-10 space-y-6">
              {CHANNELS.map((channel) => (
                <li key={channel.key}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-site-text">{channel.label}</span>
                    <span className="tnum text-sm text-site-text-muted">
                      {nl(channel.effectShare)}%{" "}
                      <span className="text-site-text-faint">
                        ({nl(channel.effectLow)}–{nl(channel.effectHigh)}%)
                      </span>
                    </span>
                  </div>
                  {/* De band op schaal 0–36%: de stip is de schatting, de balk het bereik.
                      De hulplijnen maken de schaal afleesbaar zonder er een as bij te zetten. */}
                  <span className="relative mt-2 block h-4" aria-hidden="true">
                    <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-site-line" />
                    {[10, 20, 30].map((tick) => (
                      <span
                        key={tick}
                        className="absolute top-0 h-4 w-px bg-site-line"
                        style={{ left: `${toAxis(tick)}%` }}
                      />
                    ))}
                    <span
                      className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-site-effect/25"
                      style={{
                        left: `${toAxis(channel.effectLow)}%`,
                        width: `${toAxis(channel.effectHigh - channel.effectLow)}%`,
                      }}
                    />
                    <span
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-site-effect"
                      style={{ left: `${toAxis(channel.effectShare)}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>

            {/* De as, één keer onderaan: alle rijen delen dezelfde schaal. */}
            <div className="relative mt-3 h-4" aria-hidden="true">
              {[0, 10, 20, 30].map((tick) => (
                <span
                  key={tick}
                  className="tnum absolute -translate-x-1/2 text-[0.6875rem] text-site-text-faint"
                  style={{ left: `${toAxis(tick)}%` }}
                >
                  {tick}%
                </span>
              ))}
            </div>

            <p className="mt-6 text-sm text-site-text-faint">
              Aandeel in de door media verklaarde omzet. {EXAMPLE_LABEL}.
            </p>
          </figure>
        </Reveal>

        {/* Voorbeeldcase */}
        <Reveal delay={80}>
          <article className="mt-20 overflow-hidden rounded-2xl border border-site-line bg-site-sand sm:mt-24">
            <WeekField variant="strip" highlightLast={MEASUREMENT_WINDOW} />
            <div className="p-7 sm:p-12">
            <p className="text-xs uppercase tracking-[0.14em] text-site-text-faint">
              Voorbeeldcase — samengesteld uit een voorbeelddataset, geen klantresultaat
            </p>
            <h3 className="mt-4 max-w-2xl font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-tight tracking-tight text-site-text">
              Twaalf procent van het budget verschoven — en vooraf afgesproken hoe je zou weten of
              het klopte.
            </h3>

            <dl className="mt-8 grid gap-x-8 gap-y-4 border-y border-site-line py-6 text-sm sm:grid-cols-4">
              {[
                ["Profiel", EXAMPLE_CASE.profile],
                ["Budget", EXAMPLE_CASE.budget],
                ["Kanalen", EXAMPLE_CASE.channels],
                ["Historie", EXAMPLE_CASE.history],
              ].map(([term, value]) => (
                <div key={term}>
                  <dt className="text-site-text-faint">{term}</dt>
                  <dd className="mt-1 text-site-text">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 grid gap-8 lg:grid-cols-3">
              {EXAMPLE_CASE.findings.map((finding) => (
                <div key={finding.title}>
                  <h4 className="text-base font-semibold leading-snug tracking-tight text-site-text">
                    {finding.title}
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-site-text-muted">{finding.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 border-t border-site-line pt-6">
              <p className="max-w-3xl text-base leading-relaxed text-site-text">
                <span className="font-medium">De beslissing.</span> {EXAMPLE_CASE.decision}
              </p>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-site-text-muted">
                {EXAMPLE_CASE.outcome}
              </p>
              <p className="mt-6 max-w-3xl text-sm leading-relaxed text-site-text-faint">
                We zetten geen klantnamen of klantcijfers op deze pagina zonder toestemming, en we
                verzinnen ze niet. In een gesprek laten we een volledige analyse zien — inclusief de
                plekken waar de uitkomst onzeker was.
              </p>
            </div>
            </div>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
