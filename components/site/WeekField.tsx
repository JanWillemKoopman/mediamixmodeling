import {
  EXAMPLE_LABEL,
  MEASUREMENT_WINDOW,
  WEEKLY_RESULT,
  WEEKLY_SPEND,
} from "@/lib/site/exampleData";

// Twee reeksen boven elkaar, met dezelfde tijdas eronder: nooit twee schalen in één frame.
// Boven het resultaat per week, onder de mediabestedingen per week. Het punt van dit beeld
// is juist dat de pieken niet netjes samenvallen — daar begint de vraag die de sectie stelt.
const WEEKS = WEEKLY_SPEND.length;
const RESULT_TOP = 6;
const RESULT_H = 32;
const SPEND_BASE = 92;
const SPEND_H = 40;

function resultPath(): string {
  return WEEKLY_RESULT.map((value, i) => {
    const x = i + 0.5;
    const y = RESULT_TOP + RESULT_H - value * RESULT_H;
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

interface WeekFieldProps {
  /** "band" = breed en donker, loopt over in de sectie eronder. "strip" = compact op licht. */
  variant: "band" | "strip";
  /** Aantal weken rechts dat wordt uitgelicht (de meetperiode uit de voorbeeldcase). */
  highlightLast?: number;
}

/**
 * Het beeldmateriaal van deze pagina: vier jaar aan wekelijkse mediabestedingen en omzet.
 * Geen decoratie en geen dashboard — één boodschap: hierin zit het effect van je media
 * verstopt, en met het blote oog haal je het er niet uit.
 */
export function WeekField({ variant, highlightLast }: WeekFieldProps) {
  const onInk = variant === "band";
  const barFill = onInk ? "rgba(255,255,255,0.32)" : "#ADB3BB";
  const lineStroke = onInk ? "#8FB8F2" : "#0F5099";
  const axis = onInk ? "rgba(255,255,255,0.16)" : "rgba(20,28,47,0.14)";
  const highlightFrom = highlightLast ? WEEKS - highlightLast : null;

  return (
    <figure
      className={
        onInk
          ? "site-grain relative w-full bg-site-ink pt-10 sm:pt-14"
          : "relative w-full bg-site-sand/60 px-5 pb-5 pt-6 sm:px-8"
      }
    >
      <figcaption
        className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs uppercase tracking-[0.14em] ${
          onInk ? "px-5 text-white/55 sm:px-8 lg:px-12" : "text-site-text-faint"
        }`}
      >
        <span>{WEEKS} weken · omzet en mediabestedingen per week</span>
        <span className="normal-case tracking-normal">{EXAMPLE_LABEL}</span>
      </figcaption>

      <svg
        viewBox={`0 0 ${WEEKS} 100`}
        preserveAspectRatio="none"
        className={onInk ? "mt-5 h-[clamp(11rem,30vh,20rem)] w-full" : "mt-4 h-28 w-full sm:h-32"}
        role="img"
        aria-label={`Vier jaar aan wekelijkse cijfers: boven de omzet per week, onder de mediabestedingen per week. De pieken vallen niet samen. ${EXAMPLE_LABEL}.`}
      >
        {highlightFrom !== null && (
          <rect
            x={highlightFrom}
            y="0"
            width={WEEKS - highlightFrom}
            height="100"
            fill={onInk ? "rgba(143,184,242,0.10)" : "rgba(15,80,153,0.07)"}
          />
        )}

        {/* Boven: het resultaat per week. */}
        <path
          d={resultPath()}
          fill="none"
          stroke={lineStroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Scheidingslijn tussen de twee reeksen: één gedeelde tijdas, twee eigen schalen. */}
        <line
          x1="0"
          y1={SPEND_BASE}
          x2={WEEKS}
          y2={SPEND_BASE}
          stroke={axis}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {/* Onder: de mediabestedingen per week. */}
        {WEEKLY_SPEND.map((value, i) => (
          <rect
            key={i}
            x={i + 0.18}
            y={SPEND_BASE - value * SPEND_H}
            width="0.64"
            height={value * SPEND_H}
            fill={barFill}
          />
        ))}
      </svg>

      <div
        className={`mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs ${
          onInk ? "px-5 text-white/55 sm:px-8 lg:px-12" : "text-site-text-faint"
        }`}
      >
        <span className="flex items-center gap-2">
          <span className="h-px w-5" style={{ backgroundColor: lineStroke }} aria-hidden="true" />
          Omzet per week
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-1.5" style={{ backgroundColor: barFill }} aria-hidden="true" />
          Mediabestedingen per week
        </span>
        {highlightLast && (
          <span className="flex items-center gap-2">
            <span
              className="h-2.5 w-4"
              style={{ backgroundColor: onInk ? "rgba(143,184,242,0.18)" : "rgba(15,80,153,0.10)" }}
              aria-hidden="true"
            />
            Laatste {MEASUREMENT_WINDOW} weken · meetperiode
          </span>
        )}
      </div>

      {onInk && (
        <p className="mx-auto mt-8 max-w-2xl px-5 pb-10 text-center text-base leading-relaxed text-site-on-ink-muted sm:px-8 sm:pb-14">
          Vier jaar aan weken. Je ziet pieken in je omzet en pieken in je bestedingen — maar
          niet of het één het ander veroorzaakte, of dat het seizoen ze allebei omhoog duwde.
          Precies daar begint de vraag.
        </p>
      )}
    </figure>
  );
}
