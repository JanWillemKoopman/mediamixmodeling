import { DECISION_FLOW } from "@/lib/site/copy";
import { EXAMPLE_LABEL, SCENARIO, estimateScenario } from "@/lib/site/exampleData";
import { signedPct } from "@/lib/site/format";
import { BudgetBar } from "./BudgetBar";
import { Reveal } from "./Reveal";
import { shareSentence, shiftedSpendSegments, spendSegments } from "./segments";

const SHIFT = SCENARIO.initial;

/**
 * Van inzicht naar beslissing. Het inzicht zelf is niet het product — de betere beslissing is
 * dat wel. Daarom eindigt deze sectie niet bij een grafiek maar bij twee verdelingen naast
 * elkaar en de vraag welke je kiest.
 */
export function DecisionFlow() {
  const { low, high } = estimateScenario(SHIFT);
  const current = spendSegments();
  const proposed = shiftedSpendSegments(SHIFT);

  return (
    <section className="border-t border-site-line bg-site-sand" aria-labelledby="beslissing-titel">
      <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
        <Reveal>
          <h2
            id="beslissing-titel"
            className="max-w-3xl font-display text-[clamp(1.875rem,4vw,3rem)] leading-[1.1] tracking-tight text-site-text"
          >
            Inzicht is pas waardevol als het tot een betere beslissing leidt.
          </h2>
        </Reveal>

        <ol className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
          {DECISION_FLOW.map((item, index) => (
            <li key={item.step} className="border-t border-site-line-strong pt-5">
              <Reveal delay={index * 70}>
                <p className="tnum text-xs text-site-text-faint">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-2 text-base font-semibold tracking-tight text-site-text">{item.step}</h3>
                <p className="mt-1 text-sm text-site-text-muted">{item.question}</p>
                <p className="mt-3 text-sm leading-relaxed text-site-text-faint">{item.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal delay={80}>
          <figure className="mt-20 border-t border-site-line pt-12">
            <figcaption className="max-w-2xl text-base leading-relaxed text-site-text-muted">
              Zo ziet die beslissing eruit: dezelfde euro&apos;s, anders verdeeld. Niet omdat een
              model dat voorschrijft, maar omdat je nu kunt afwegen wat je ervoor terugverwacht.
            </figcaption>

            <div className="mt-10 grid gap-10 lg:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-site-text-faint">
                  Huidige verdeling
                </p>
                <BudgetBar
                  segments={current}
                  gapColor="#F1EDE6"
                  className="mt-3"
                  height="h-16"
                  srSummary={shareSentence("Huidige verdeling van het mediabudget", current)}
                />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-site-text-faint">
                  Voorstel · {SHIFT}% verschoven naar {SCENARIO.toLabel}
                </p>
                <BudgetBar
                  segments={proposed}
                  gapColor="#F1EDE6"
                  className="mt-3"
                  height="h-16"
                  srSummary={shareSentence("Voorgestelde verdeling van het mediabudget", proposed)}
                />
              </div>
            </div>

            <p className="mt-8 max-w-2xl text-sm leading-relaxed text-site-text-muted">
              Geschat effect van deze verschuiving op de omzet, bij een gelijkblijvend totaalbudget:{" "}
              <span className="tnum font-medium text-site-effect">
                {signedPct(low)} tot {signedPct(high)}
              </span>
              . Inclusief de mogelijkheid dat het effect klein blijft — dat hoort erbij.{" "}
              <span className="text-site-text-faint">{EXAMPLE_LABEL}.</span>
            </p>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
