import Link from "next/link";
import { LogOut } from "lucide-react";
import { humanizeError } from "@/lib/humanizeMessage";
import { GuideModal } from "@/components/GuideModal";
import type { JobStatus, ProjectStatus } from "@/lib/types";

// Flat kaart: wit vlak zonder rand of schaduw, nauwelijks afgerond — onderscheiden
// van het canvas door zijn tint.
export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-surface ${className}`}>{children}</div>;
}

// Behouden als alias: bestaande imports van `Card` blijven werken, met dezelfde
// padding-conventie als voorheen (p-5).
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <Panel className={`p-5 ${className}`}>{children}</Panel>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // Groene primaire pil-knop (witte tekst op House Green) — plat, geen schaduw.
  primary:
    "bg-accent text-white font-semibold hover:bg-accent-hover disabled:bg-surface-3 disabled:text-fg-faint",
  // Secundaire pil: dunne groene rand + groene tekst, transparant — zoals starbucks.nl.
  secondary:
    "border border-accent/70 bg-transparent text-accent font-semibold hover:bg-accent-dim disabled:border-border disabled:text-fg-faint",
  ghost: "text-fg-muted font-medium hover:bg-surface-2 hover:text-fg",
  danger: "border border-danger/40 bg-danger-dim text-danger font-medium hover:bg-danger/15",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm transition-all focus:outline-none focus-visible:shadow-glow disabled:cursor-not-allowed ${BUTTON_VARIANT[variant]} ${className}`}
      {...props}
    />
  );
}

// Button-styled <Link> — for navigation that should look like a Button but can't be a
// <button> (e.g. opening another route from inside a card that's itself a Link).
export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: React.ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm transition-all focus:outline-none focus-visible:shadow-glow ${BUTTON_VARIANT[variant]} ${className}`}
      {...props}
    />
  );
}

const FIELD_BASE =
  "w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-faint transition focus:outline-none focus:shadow-glow-sm";

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD_BASE} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD_BASE} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD_BASE} ${className}`} {...props} />;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const STATUS_LABEL: Record<JobStatus | ProjectStatus, string> = {
  draft: "Concept",
  published: "Gepubliceerd",
  archived: "Gearchiveerd",
  queued: "In wachtrij",
  running: "Bezig",
  succeeded: "Klaar",
  failed: "Mislukt",
  cancelled: "Geannuleerd",
};

// Groen = goed/klaar, rood = mislukt/aandacht, amber = bezig, neutraal = rest.
const STATUS_TONE: Record<JobStatus | ProjectStatus, string> = {
  draft: "border border-border bg-surface-2 text-fg-muted",
  published: "border border-success/30 bg-success-dim text-success",
  archived: "border border-border bg-surface-2 text-fg-faint",
  queued: "border border-border bg-surface-2 text-fg-muted",
  running: "border border-warn/30 bg-warn-dim text-warn",
  succeeded: "border border-success/30 bg-success-dim text-success",
  failed: "border border-danger/30 bg-danger-dim text-danger",
  cancelled: "border border-border bg-surface-2 text-fg-faint",
};

export function StatusBadge({ status }: { status: JobStatus | ProjectStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// Nette foutweergave: de begrijpelijke Nederlandse melding prominent, de ruwe technische
// melding (indien afwijkend) klein en inklapbaar eronder — zo blijft debug-informatie
// beschikbaar zonder de lezer een Engelse stacktrace als hoofdboodschap te geven.
// Native <details>, dus bruikbaar in server- én clientcomponenten.
export function ErrorNotice({ raw, fallback }: { raw: string | null | undefined; fallback: string }) {
  const { text, technical } = humanizeError(raw, fallback);
  return (
    <div className="rounded-lg border border-danger/30 bg-danger-dim px-3 py-2.5">
      <p className="text-sm text-danger">{text}</p>
      {technical && (
        <details className="mt-1.5">
          <summary className="cursor-pointer select-none text-[11px] text-danger/60">
            Technische details
          </summary>
          <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-danger/70">{technical}</p>
        </details>
      )}
    </div>
  );
}

// Short Dutch explanations for the MMM jargon that shows up in result tables — aimed at
// "enige technische kennis", not a statistician: enough to know what to trust, not a
// textbook definition.
export const MMM_GLOSSARY: Record<string, string> = {
  roas: "Return on ad spend: hoeveel KPI (bv. omzet) elke geïnvesteerde euro in dit kanaal naar schatting opleverde.",
  adstock: "Adstock (carry-over): het effect van marketing houdt na de uitgave nog een tijd aan — de half-life is hoe lang het duurt voor de helft van dat effect is weggeëbd.",
  saturation: "Verzadigingspunt: vanaf hier levert extra spend in dit kanaal steeds minder op (afnemend rendement).",
  r2: "R² (verklaarde variantie): hoe goed het model de KPI over tijd volgt. Dichter bij 1 is beter.",
  mape: "MAPE (gemiddelde procentuele afwijking): hoe ver de modelvoorspelling gemiddeld naast de werkelijke KPI zit.",
  coverage: "Dekking: hoe vaak de werkelijke KPI binnen de opgegeven onzekerheidsmarge viel. Zou dicht bij het opgegeven percentage moeten liggen.",
  rhat: "R-hat: een controlegetal of de statistische schatting stabiel is. Boven de 1,05 is een teken dat de uitkomst nog niet betrouwbaar is.",
  divergences: "Divergenties: het aantal keer dat de schattingsmethode vastliep. Een hoog aantal is een teken dat de uitkomst voorzichtig gelezen moet worden.",
  channel_type:
    "Kanaaltype: 'intent' vangt bestaande koopintentie (merkzoekwoorden, marktplaatsen), 'brand' bouwt nieuwe aandacht op (social, display). Bepaalt de verwachting die het model meekrijgt.",
  likelihood:
    "Ruismodel: hoe de wekelijkse schommelingen rond het model worden behandeld. 'Normaal' voor gewone omzet; 'Student-t' als er duidelijke uitschieters zijn; Poisson/negative binomial alleen voor lage tellingen (bv. 5–50 leads per week).",
  trend: "Trend: langzame structurele op- of afbouw van de basislijn, los van marketing. 'Piecewise' mag op enkele punten buigen — alleen bij een duidelijke knik in de historie.",
  seasonality:
    "Seizoen: een terugkerend jaarpatroon in de KPI (bv. kerstdrukte). 52 = jaarlijks patroon op weekdata. Leeg laten = geen seizoenscomponent.",
  saturation_form:
    "Verzadigingsvorm: hoe afnemend rendement wordt gemodelleerd. 'Hill' is flexibel (standaard); 'logistic' is robuuster bij weinig of ruisige data.",
};

// A term with a hover tooltip explaining it — used instead of a link to an external
// glossary, so the explanation stays exactly where the jargon appears.
export function Term({ children, definition }: { children: React.ReactNode; definition: string }) {
  return (
    <span className="group relative inline-flex cursor-help items-center border-b border-dotted border-fg-faint">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-border-strong bg-surface-3 px-2.5 py-1.5 text-xs font-normal normal-case leading-snug tracking-normal text-fg opacity-0 shadow-panel transition-opacity group-hover:opacity-100">
        {definition}
      </span>
    </span>
  );
}

export function TopBar({ email, guideMarkdown }: { email: string | null; guideMarkdown?: string }) {
  return (
    // Niet-sticky op mobiel (scrolt gewoon mee — de stappen-nav hieronder blijft daar
    // wél sticky, zie PipelineShell.tsx); vanaf sm weer sticky zoals voorheen.
    <header className="top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 py-3 backdrop-blur sm:sticky sm:px-6">
      <Link
        href="/projects"
        className="flex-none text-[15px] font-bold lowercase tracking-tight text-brand-700 transition hover:text-accent"
      >
        media mix modeling
      </Link>
      <div className="flex min-w-0 items-center gap-2 text-sm text-fg-muted sm:gap-3">
        {/* E-mail alleen op ruimere schermen — op mobiel zou het merk + knoppen
            verdringen; truncate vangt lange adressen op tablet af. */}
        <span className="hidden max-w-[16rem] truncate font-mono text-xs text-fg-faint sm:inline">{email}</span>
        {guideMarkdown && <GuideModal markdown={guideMarkdown} />}
        <form action="/auth/signout" method="post">
          {/* Op mobiel alleen het icoon (kleinere knop, geen verdringing); tekst
              vanaf sm weer zichtbaar. */}
          <button
            aria-label="Uitloggen"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-fg-muted transition hover:border-border-strong hover:text-fg sm:px-3"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Uitloggen</span>
          </button>
        </form>
      </div>
    </header>
  );
}
