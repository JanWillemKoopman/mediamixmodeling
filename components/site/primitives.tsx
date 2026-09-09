import Link from "next/link";
import type { ReactNode } from "react";

/**
 * De bouwstenen van het ontwerpsysteem: container, sectie, microlabel, sectiekop, knoppen
 * en kaartchrome. Alles wat er op meerdere plekken hetzelfde uit moet zien staat hier, zodat
 * de site één systeem blijft in plaats van een verzameling losse secties.
 *
 * Het systeem in één alinea: wit papier, bijna-zwarte kapitale koppen met krappe
 * letterafstand, een mono-microlabel boven elke sectie, dunne grijze lijnen, ruime
 * radii en precies twee signaalkleuren — violet voor actie, groen voor effect.
 */

// ── Layout ────────────────────────────────────────────────────────────────────────────

/** Eén brede container met vaste zijmarges; `narrow` voor lopende tekstblokken. */
export function Container({
  children,
  className = "",
  narrow = false,
}: {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}) {
  return (
    <div
      className={`mx-auto w-full px-5 xl:px-16 ${narrow ? "max-w-[80rem]" : "max-w-[120rem]"} ${className}`}
    >
      {children}
    </div>
  );
}

/** Verticaal ritme van een sectie. `wash` geeft het zachte kleurveld van de opening. */
export function Section({
  id,
  children,
  className = "",
  wash = false,
  labelledBy,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  wash?: boolean;
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`site-anchor relative isolate overflow-hidden py-20 sm:py-24 lg:py-32 ${
        wash ? "u-wash bg-site-paper" : "bg-site-paper"
      } ${className}`}
    >
      {children}
    </section>
  );
}

// ── Typografie ────────────────────────────────────────────────────────────────────────

/** Mono-microlabel: het meest herkenbare detail van het systeem. */
export function Label({
  children,
  tone = "green",
  className = "",
}: {
  children: ReactNode;
  tone?: "green" | "violet" | "muted";
  className?: string;
}) {
  const tones = {
    green: "text-site-green-text",
    violet: "text-site-violet",
    muted: "text-site-muted-2",
  } as const;
  return <p className={`u-label ${tones[tone]} ${className}`}>{children}</p>;
}

/**
 * Sectiekop: spookwoord, microlabel, kapitale kop waarvan de tweede regel het kleurverloop
 * krijgt, en één introzin. Overal dezelfde opbouw.
 */
export function SectionHead({
  id,
  watermark,
  label,
  title,
  accent,
  intro,
  align = "left",
  className = "",
}: {
  id?: string;
  watermark?: string;
  label: string;
  /** Eerste regel van de kop: de constatering. */
  title: ReactNode;
  /** Tweede regel: de belofte. Krijgt het kleurverloop. */
  accent?: ReactNode;
  intro?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div className={`relative ${centered ? "text-center" : ""} ${className}`}>
      {watermark && (
        <span
          aria-hidden="true"
          className={`u-watermark absolute -top-[0.18em] z-0 hidden select-none lg:block ${
            centered ? "left-1/2 -translate-x-1/2" : "-left-1"
          }`}
        >
          {watermark}
        </span>
      )}

      <div className={`relative z-10 ${centered ? "mx-auto max-w-3xl" : "max-w-4xl"}`}>
        <Label className={centered ? "mx-auto w-fit" : ""}>{label}</Label>
        <h2 id={id} className="u-display u-h2 mt-5 text-site-ink">
          {title}
          {accent && (
            <>
              <br />
              <span className="u-grad">{accent}</span>
            </>
          )}
        </h2>
        {intro && <p className={`u-sub mt-6 ${centered ? "mx-auto" : ""}`}>{intro}</p>}
      </div>
    </div>
  );
}

// ── Knoppen ───────────────────────────────────────────────────────────────────────────

type Variant = "primary" | "ghost" | "ink";

export function Button({
  href,
  children,
  variant = "primary",
  className = "",
  arrow = false,
  small = false,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
  arrow?: boolean;
  small?: boolean;
}) {
  const cls = `u-btn u-btn-${variant} ${small ? "u-btn-sm" : ""} group ${className}`;
  const content = (
    <>
      {children}
      {arrow && <Arrow />}
    </>
  );
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <a href={href} className={cls}>
      {content}
    </a>
  );
}

/** Pijl die bij hover een haartje meebeweegt — de enige decoratieve beweging op knoppen. */
export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 transition-transform duration-200 ease-out group-hover:translate-x-0.5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

// ── Kaartchrome ───────────────────────────────────────────────────────────────────────

/** Het label dat elke visualisatie als voorbeeld markeert. Nooit weglaten. */
export function ExampleTag({ children = "Illustratief voorbeeld" }: { children?: ReactNode }) {
  return (
    <span className="u-pill u-label-sm text-site-muted-2">
      <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

/** Kop van een productkaart: statuslampje, titel, rechts een tag of metriek. */
export function CardBar({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-site-line px-4 py-3 sm:px-5">
      <span className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="site-pulse h-1.5 w-1.5 shrink-0 rounded-full bg-site-green-text" />
        <span className="u-label truncate text-site-muted-2">{title}</span>
      </span>
      {right && <span className="shrink-0">{right}</span>}
    </div>
  );
}

/** Groot cijfer met mono-onderschrift — het statblok van de site. */
export function Stat({
  value,
  label,
  sub,
  accent = false,
}: {
  value: ReactNode;
  label: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        className={`tnum text-[clamp(1.75rem,3.4vw,2.9rem)] font-extrabold leading-none tracking-[-0.035em] ${
          accent ? "text-site-green-text" : "text-site-ink"
        }`}
      >
        {value}
      </p>
      <p className="u-label mt-3 text-site-ink">{label}</p>
      {sub && <p className="mt-2 text-[0.85rem] leading-snug text-site-muted">{sub}</p>}
    </div>
  );
}
