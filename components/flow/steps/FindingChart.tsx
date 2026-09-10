"use client";

// Het grafiekje bij een vraag in stap 4: de hele reeks, met de weken die de vraag oproepen
// gemarkeerd.
//
// Waarom met de hand getekend en niet met Recharts: dit is geen dashboardgrafiek maar een
// bewijsstuk van vier regels — één lijn, een band over de weken die het betreft, en een
// stippellijn op het midden. Een assenstelsel, legenda en tooltip zouden de kaart voller
// maken zonder er iets aan toe te voegen; de getallen zelf staan eronder in de weektabel.
//
// Wat het NIET doet: interpoleren over ontbrekende weken. Een gat is precies waar de vraag
// over gaat, dus daar breekt de lijn — anders zou de grafiek een waarde tonen die er niet is.

import type { FindingMark, FindingSeries } from "@/lib/flow/dataCheck";

const WIDTH = 600;
const HEIGHT = 72;
const PADDING = 4;

/** Elke reeks op zijn eigen schaal, zodat twee kolommen met verschillende eenheden te
 *  vergelijken zijn op hun VORM — precies waar de vraag over gaat. */
function scale(values: (number | null)[]): (v: number) => number {
  const known = values.filter((v): v is number => v != null);
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  return (v) => HEIGHT - PADDING - ((v - min) / span) * (HEIGHT - 2 * PADDING);
}

function median(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null).sort((a, b) => a - b);
  if (known.length === 0) return null;
  return known[Math.floor(known.length / 2)];
}

/** Van reeks naar padsegmenten: elk gat breekt het pad, zodat het zichtbaar blijft. */
function segments(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string[] {
  const paths: string[] = [];
  let current: string[] = [];
  values.forEach((value, i) => {
    if (value == null) {
      if (current.length > 1) paths.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(value).toFixed(1)}`);
  });
  if (current.length > 1) paths.push(current.join(" "));
  return paths;
}

const LINE_COLORS = ["#003DA5", "#ED6935"];

export function FindingChart({
  labels,
  series,
  marks,
}: {
  labels: string[];
  series: FindingSeries[];
  marks: FindingMark[];
}) {
  if (labels.length < 2 || series.length === 0) return null;
  const x = (i: number) => (i / (labels.length - 1)) * WIDTH;
  const step = WIDTH / Math.max(1, labels.length - 1);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Verloop van ${series.map((s) => s.name).join(" en ")} over ${labels.length} weken, van ${labels[0]} tot ${labels[labels.length - 1]}.`}
        className="h-[72px] w-full rounded-lg border border-border bg-surface"
      >
        {/* De weken waar de vraag over gaat. Een gat krijgt een band, een piek een streep. */}
        {marks.map((mark, i) => {
          // Een gat van twee weken in een reeks van tweehonderd is drie pixels breed. Daarom
          // een ondergrens: een markering die je moet zoeken, wijst niets aan.
          const half = Math.max(step, 3) / 2;
          const left = x(mark.from) - half;
          const width = x(mark.to) - x(mark.from) + 2 * half;
          return (
            <rect
              key={i}
              x={Math.max(0, left)}
              y={0}
              width={width}
              height={HEIGHT}
              fill={mark.tone === "gap" ? "rgba(154,107,18,0.30)" : "rgba(192,54,44,0.18)"}
            />
          );
        })}

        {series.map((s, index) => {
          const y = scale(s.values);
          const mid = series.length === 1 ? median(s.values) : null;
          return (
            <g key={s.name}>
              {mid != null && (
                <line
                  x1={0}
                  x2={WIDTH}
                  y1={y(mid)}
                  y2={y(mid)}
                  stroke="rgba(25,36,59,0.28)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {segments(s.values, x, y).map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={LINE_COLORS[index % LINE_COLORS.length]}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {/* Het punt waar het om gaat, benoemd: zonder stip is een piek in een lijn van
                  honderd weken niet aan te wijzen. */}
              {marks
                .filter((m) => m.tone === "peak")
                .map((m, i) => {
                  const value = s.values[m.from];
                  return value == null ? null : (
                    <circle
                      key={i}
                      cx={x(m.from)}
                      cy={y(value)}
                      r={3}
                      fill="#C0362C"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex items-center justify-between gap-2 text-[10px] text-fg-faint">
        <span>{labels[0]}</span>
        {series.length > 1 ? (
          <span className="flex flex-wrap items-center justify-center gap-2">
            {series.map((s, i) => (
              <span key={s.name} className="flex items-center gap-1">
                <span
                  className="inline-block h-1.5 w-3 rounded-full"
                  style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
                />
                {s.name}
              </span>
            ))}
          </span>
        ) : (
          <span>elke stip is een week · streepjeslijn = een gewone week</span>
        )}
        <span>{labels[labels.length - 1]}</span>
      </figcaption>
    </figure>
  );
}
