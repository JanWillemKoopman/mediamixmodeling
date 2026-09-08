import Link from "next/link";
import type { ReactNode } from "react";

/**
 * De bouwstenen van het ontwerpsysteem van de site: container, sectiekop, knoppen, labels
 * en paneelchrome. Alles wat er op meerdere plekken hetzelfde uit moet zien, staat hier —
 * zo blijft de site één systeem in plaats van een verzameling losse secties.
 */

// ── Layout ────────────────────────────────────────────────────────────────────────────

/** Eén containerbreedte voor de hele site. `wide` alleen voor productpanelen. */
export function Container({
  children,
  className = "",
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className={`mx-auto w-full ${wide ? "max-w-[88rem]" : "max-w-[76rem]"} px-5 sm:px-8 lg:px-10 ${className}`}>
      {children}
    </div>
  );
}

/** Verticaal ritme van een sectie. Compacter dan een klassieke marketingpagina. */
export function Section({
  id,
  children,
  className = "",
  tone = "canvas",
  labelledBy,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: "canvas" | "surface" | "ink";
  labelledBy?: string;
}) {
  const tones = {
    canvas: "bg-site-canvas text-site-text",
    surface: "bg-white text-site-text",
    ink: "on-ink bg-site-ink text-site-on-ink",
  } as const;
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`site-anchor relative ${tones[tone]} py-20 sm:py-28 lg:py-32 ${className}`}
    >
      {children}
    </section>
  );
}

// ── Typografie ────────────────────────────────────────────────────────────────────────

/** Klein technisch label boven een kop. Draagt de "software"-toon van de site. */
export function Eyebrow({ children, ink = false }: { children: ReactNode; ink?: boolean }) {
  return (
    <p
      className={`flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] ${
        ink ? "text-site-blue-ink" : "text-site-blue"
      }`}
    >
      <span aria-hidden="true" className={`h-1 w-1 rounded-full ${ink ? "bg-site-blue-ink" : "bg-site-blue"}`} />
      {children}
    </p>
  );
}

/** Sectiekop: eyebrow, kop, introzin. Eén hiërarchie op de hele site. */
export function SectionHead({
  id,
  eyebrow,
  title,
  intro,
  ink = false,
  align = "left",
  className = "",
}: {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  ink?: boolean;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={`${align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-3xl"} ${className}`}>
      {eyebrow && (
        <div className={align === "center" ? "flex justify-center" : ""}>
          <Eyebrow ink={ink}>{eyebrow}</Eyebrow>
        </div>
      )}
      <h2
        id={id}
        className={`mt-5 font-display text-[clamp(1.85rem,4.2vw,3.1rem)] font-semibold leading-[1.06] tracking-[-0.03em] ${
          ink ? "text-white" : "text-site-text"
        }`}
      >
        {title}
      </h2>
      {intro && (
        <p
          className={`mt-5 max-w-2xl text-[1.0625rem] leading-relaxed ${
            align === "center" ? "mx-auto" : ""
          } ${ink ? "text-site-on-ink-muted" : "text-site-text-muted"}`}
        >
          {intro}
        </p>
      )}
    </div>
  );
}

// ── Knoppen ───────────────────────────────────────────────────────────────────────────

const BUTTON_BASE =
  "group inline-flex items-center justify-center gap-2 rounded-ctl text-[0.9375rem] font-medium leading-none transition duration-200 ease-out";

const BUTTON_VARIANTS = {
  primary:
    "bg-site-blue px-5 py-3 text-white shadow-[0_1px_2px_rgba(11,16,32,0.16)] hover:bg-site-blue-hover hover:shadow-[0_6px_18px_-6px_rgba(31,90,255,0.65)] active:translate-y-px",
  secondary:
    "border border-site-line-strong bg-white px-5 py-3 text-site-text hover:border-site-text/30 hover:bg-site-surface-2 active:translate-y-px",
  ghost: "px-2 py-2 text-site-text-muted hover:text-site-text",
  "primary-ink":
    "bg-white px-5 py-3 text-site-ink hover:bg-site-blue-ink hover:text-site-ink active:translate-y-px",
  "secondary-ink":
    "border border-site-line-ink-strong bg-white/[0.04] px-5 py-3 text-white hover:bg-white/[0.1] active:translate-y-px",
} as const;

type Variant = keyof typeof BUTTON_VARIANTS;

export function Button({
  href,
  children,
  variant = "primary",
  className = "",
  arrow = false,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
  arrow?: boolean;
}) {
  const cls = `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`;
  const content = (
    <>
      {children}
      {arrow && <Arrow />}
    </>
  );
  // Interne routes via next/link (client-side navigatie), ankers als gewone link.
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
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

// ── Paneel-chrome ─────────────────────────────────────────────────────────────────────

/** Het label dat elke visualisatie als voorbeeld markeert. Nooit weglaten. */
export function ExampleTag({ children, ink = false }: { children: ReactNode; ink?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
        ink
          ? "border-site-line-ink-strong bg-white/[0.04] text-site-on-ink-faint"
          : "border-site-line bg-site-surface-2 text-site-text-faint"
      }`}
    >
      <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current opacity-60" />
      {children}
    </span>
  );
}

/** Kleine kolomkop binnen een productpaneel. */
export function PanelLabel({ children, ink = false }: { children: ReactNode; ink?: boolean }) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
        ink ? "text-site-on-ink-faint" : "text-site-text-faint"
      }`}
    >
      {children}
    </span>
  );
}

/** Titelbalk van een productpaneel: statuslampje, titel, rechts een metriek of tag. */
export function PanelBar({
  title,
  right,
  ink = false,
}: {
  title: ReactNode;
  right?: ReactNode;
  ink?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 ${
        ink ? "border-site-line-ink" : "border-site-line"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className={`site-pulse h-1.5 w-1.5 shrink-0 rounded-full ${ink ? "bg-site-blue-ink" : "bg-site-blue"}`}
        />
        <span
          className={`truncate font-mono text-[11px] uppercase tracking-[0.14em] ${
            ink ? "text-site-on-ink-muted" : "text-site-text-muted"
          }`}
        >
          {title}
        </span>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
