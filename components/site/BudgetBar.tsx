import type { CSSProperties } from "react";

export interface BarSegment {
  key: string;
  label: string;
  /** Breedte in procenten. */
  pct: number;
  /** Breedte waar dit segment vandaan komt in de animatie (alleen voor de effect-balk). */
  fromPct?: number;
  color: string;
  /** Staat er lichte tekst op dit segment? */
  onDark: boolean;
}

interface BudgetBarProps {
  segments: BarSegment[];
  /** "effect" laat de segmenten van `fromPct` naar `pct` bewegen zodra de figuur in beeld komt. */
  variant?: "static" | "effect";
  /** Kleur van de 2px-tussenruimte: de achtergrond waarop de balk staat. */
  gapColor?: string;
  height?: string;
  className?: string;
  /** Zin die schermlezers in plaats van de balk krijgen. Zonder dit blijft de balk stil. */
  srSummary?: string;
}

/**
 * Eén horizontale balk van 100%: de verdeling van een mediabudget of van het geschatte
 * effect. Segmenten houden overal op de pagina dezelfde volgorde en dezelfde kleurstap, en
 * dragen hun eigen label — kleur is nooit de enige drager van betekenis.
 */
export function BudgetBar({
  segments,
  variant = "static",
  gapColor = "#FBFAF7",
  height = "h-[4.5rem]",
  className = "",
  srSummary,
}: BudgetBarProps) {
  return (
    <>
      {srSummary && <p className="sr-only">{srSummary}</p>}
      <div className={`flex w-full overflow-hidden rounded-lg ${height} ${className}`} aria-hidden="true">
      {segments.map((segment, index) => (
        <div
          key={segment.key}
          className={`site-seg ${variant === "effect" ? "site-seg--effect" : ""} flex items-center overflow-hidden px-2 sm:px-3`}
          style={
            {
              "--w": `${segment.pct}%`,
              "--w0": `${segment.fromPct ?? segment.pct}%`,
              backgroundColor: segment.color,
              borderRight: index < segments.length - 1 ? `2px solid ${gapColor}` : undefined,
            } as CSSProperties
          }
        >
          {segment.pct >= 7 && (
            <span
              className={`whitespace-nowrap text-[0.6875rem] leading-tight sm:text-xs ${
                segment.onDark ? "text-white" : "text-site-text"
              }`}
            >
              {segment.pct >= 15 && <span className="hidden font-medium lg:inline">{segment.label} </span>}
              <span className="tnum">{Math.round(segment.pct)}%</span>
            </span>
          )}
        </div>
        ))}
      </div>
    </>
  );
}

interface BarLegendProps {
  items: { key: string; label: string; spendColor: string; effectColor: string }[];
  onInk?: boolean;
}

/** Legenda met beide kleurstappen per kanaal — dezelfde volgorde als in de balken. */
export function BarLegend({ items, onInk = false }: BarLegendProps) {
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-2 text-xs ${onInk ? "text-site-on-ink-muted" : "text-site-text-muted"}`}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          <span className="flex" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-l-sm" style={{ backgroundColor: item.spendColor }} />
            <span className="h-2.5 w-2.5 rounded-r-sm" style={{ backgroundColor: item.effectColor }} />
          </span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
