"use client";

import { useState, type CSSProperties } from "react";
import { EXAMPLE_LABEL, SCENARIO, estimateScenario } from "@/lib/site/exampleData";
import { signedPct } from "@/lib/site/format";

// De schaal waarop de bandbreedte wordt getekend, in procentpunten omzet.
const AXIS_MIN = -2;
const AXIS_MAX = 7;
const toAxis = (value: number) => ((value - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100;

/**
 * Het visuele hoogtepunt: de vraag waar het management op stuurt, met één bediening eronder.
 * De uitkomst is bewust een bandbreedte en geen enkel getal — en hoe verder je verschuift,
 * hoe breder die band wordt. Dat is precies wat een eerlijke schatting doet.
 */
export function ManagementQuestion() {
  const [shift, setShift] = useState(SCENARIO.initial);
  const { mid, low, high } = estimateScenario(shift);

  const sentence =
    shift === 0
      ? "Bij een ongewijzigde verdeling verandert het geschatte resultaat niet."
      : `Bij een verschuiving van ${shift}% van het budget van ${SCENARIO.fromLabel} naar ${SCENARIO.toLabel} ligt het geschatte effect op de omzet tussen ${signedPct(low)} en ${signedPct(high)}.`;

  return (
    <section id="de-vraag" className="site-anchor bg-site-ink text-site-on-ink" aria-labelledby="vraag-titel">
      <div className="mx-auto max-w-[80rem] px-5 py-28 sm:px-8 sm:py-40 lg:px-12">
        <h2
          id="vraag-titel"
          className="mx-auto max-w-4xl text-center font-display text-[clamp(2.25rem,6vw,4.5rem)] leading-[1.06] tracking-tight"
        >
          Wat gebeurt er met je resultaat als je je mediabudget verandert?
        </h2>
        <p className="mx-auto mt-8 max-w-xl text-center text-base leading-relaxed text-site-on-ink-muted">
          Die vraag komt zelden uit een rapportage. Hij komt uit de directiekamer — en hij verdient
          een antwoord met een eerlijke marge eromheen.
        </p>

        <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-site-line-ink bg-site-ink-2 p-6 sm:mt-20 sm:p-9">
          <label htmlFor="budget-shift" className="block text-sm text-site-on-ink-muted">
            Verschuif <span className="tnum font-medium text-site-on-ink">{shift}%</span> van je
            mediabudget van {SCENARIO.fromLabel} naar {SCENARIO.toLabel}
          </label>
          <input
            id="budget-shift"
            type="range"
            className="site-range site-range--ink mt-2"
            min={SCENARIO.min}
            max={SCENARIO.max}
            step={SCENARIO.step}
            value={shift}
            aria-valuetext={`${shift} procent van het budget verschoven naar ${SCENARIO.toLabel}`}
            onChange={(event) => setShift(Number(event.target.value))}
          />

          <div className="mt-7">
            <p className="text-sm text-site-on-ink-muted">Geschat effect op de omzet</p>
            <p className="tnum mt-1 font-display text-[clamp(1.75rem,7vw,3rem)] leading-none text-site-effect-ink">
              {signedPct(low)}{" "}
              <span className="text-[0.45em] text-site-on-ink-muted">tot</span> {signedPct(high)}
            </p>
          </div>

          {/* De band op schaal, met de nullijn als ijkpunt: waar het effect waarschijnlijk ligt. */}
          <div className="relative mt-6 h-14" aria-hidden="true">
            <div className="absolute inset-x-0 top-4 h-px bg-white/20" />
            <div className="absolute top-0 h-8 w-px bg-white/40" style={{ left: `${toAxis(0)}%` }} />
            <div
              className="absolute top-[0.6875rem] h-2.5 rounded-full bg-site-effect-ink/35 transition-[left,width] duration-300 ease-out"
              style={
                {
                  left: `${toAxis(low)}%`,
                  width: `${toAxis(high) - toAxis(low)}%`,
                } as CSSProperties
              }
            />
            <div
              className="absolute top-[0.375rem] h-5 w-[3px] rounded-full bg-site-effect-ink transition-[left] duration-300 ease-out"
              style={{ left: `${toAxis(mid)}%` }}
            />
            <span className="tnum absolute top-9 text-[0.6875rem] text-white/60" style={{ left: 0 }}>
              −2%
            </span>
            <span
              className="tnum absolute top-9 -translate-x-1/2 text-[0.6875rem] text-white/60"
              style={{ left: `${toAxis(0)}%` }}
            >
              0%
            </span>
            <span className="tnum absolute top-9 right-0 text-[0.6875rem] text-white/60">+7%</span>
          </div>

          <p className="sr-only" aria-live="polite">
            {sentence}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-site-on-ink-muted">
            {sentence} Hoe groter de verschuiving, hoe breder de marge — ook dat is informatie.
          </p>
          <p className="mt-3 text-xs text-white/60">
            {EXAMPLE_LABEL}. Geen voorspelling voor jouw situatie.
          </p>
        </div>
      </div>
    </section>
  );
}
