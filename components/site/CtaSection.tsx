"use client";

import { useState } from "react";
import { FIT_CRITERIA, SITE } from "@/lib/site/copy";
import { Reveal } from "./motion";
import { Container, PanelLabel } from "./primitives";

/**
 * Sectie 12 — de enige conversie op de site. Vraagt precies genoeg voor een zinnig eerste
 * gesprek en geen veld meer. Gewone <form> met echte labels, een zichtbare foutmelding en
 * een verborgen honeypot-veld tegen bots; de aanvraag gaat naar /api/demo-request.
 */

const BUDGET_OPTIONS = [
  "Tot € 500.000 per jaar",
  "€ 500.000 – € 2 mln per jaar",
  "€ 2 mln – € 10 mln per jaar",
  "Meer dan € 10 mln per jaar",
  "Liever nog niet zeggen",
];

type Status = "idle" | "sending" | "sent" | "error";

export function CtaSection() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;

    // De API kent één naamveld; voor- en achternaam gaan er als één naam in.
    const payload = {
      ...data,
      name: [data.firstName, data.lastName].filter(Boolean).join(" ").trim(),
    };

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setStatus("error");
        setError(body?.error ?? "Er ging iets mis bij het versturen. Probeer het zo nog eens.");
        return;
      }
      form.reset();
      setStatus("sent");
    } catch {
      setStatus("error");
      setError("We konden je aanvraag niet versturen. Controleer je verbinding en probeer het opnieuw.");
    }
  }

  return (
    <section
      id="demo"
      aria-labelledby="demo-titel"
      className="site-anchor on-ink relative overflow-hidden bg-site-ink py-20 text-site-on-ink sm:py-28 lg:py-32"
    >
      <div aria-hidden="true" className="site-grid-ink absolute inset-0 opacity-50" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(55%_100%_at_50%_0%,rgba(31,90,255,0.22),transparent_70%)]"
      />

      <Container className="relative">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
          <Reveal>
            <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-site-blue-ink">
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-site-blue-ink" />
              Demo
            </p>
            <h2
              id="demo-titel"
              className="mt-5 max-w-xl font-display text-[clamp(2rem,4.6vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-white"
            >
              Begin bij één vraag: wat doet ons mediabudget?
            </h2>
            <p className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-site-on-ink-muted">
              In een demo van ongeveer een half uur laten we zien hoe media-effect zichtbaar wordt en
              welke vragen je ermee kunt beantwoorden. Geen verkooppraatje over techniek — een gesprek
              over je budgetverdeling.
            </p>

            <div className="mt-10 border-t border-site-line-ink pt-8">
              <PanelLabel ink>Dit gesprek is nuttig als</PanelLabel>
              <ul className="mt-4 space-y-3">
                {FIT_CRITERIA.map((criterion) => (
                  <li key={criterion} className="flex gap-3 text-[0.9375rem] leading-relaxed text-site-on-ink-muted">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-site-blue-ink" />
                    {criterion}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="rounded-panel border border-site-line-ink bg-site-ink-2/90 p-5 backdrop-blur sm:p-7">
              {status === "sent" ? (
                <div role="status">
                  <h3 className="font-display text-xl font-semibold tracking-[-0.02em] text-white">
                    Je aanvraag staat genoteerd.
                  </h3>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed text-site-on-ink-muted">
                    We nemen binnen twee werkdagen contact op om een moment te plannen. Wil je in de
                    tussentijd iets toevoegen, reageer dan gewoon op onze mail.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatus("idle")}
                    className="mt-6 text-[0.875rem] text-site-blue-ink underline underline-offset-4 transition-colors hover:text-white"
                  >
                    Nog een aanvraag versturen
                  </button>
                </div>
              ) : (
                <form onSubmit={onSubmit}>
                  <h3 className="font-display text-xl font-semibold tracking-[-0.02em] text-white">
                    {SITE.ctaPrimary}
                  </h3>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <Field id="firstName" name="firstName" label="Voornaam" autoComplete="given-name" required />
                    <Field id="lastName" name="lastName" label="Achternaam" autoComplete="family-name" required />
                    <Field
                      id="email"
                      name="email"
                      label="Zakelijk e-mailadres"
                      type="email"
                      autoComplete="email"
                      required
                      className="sm:col-span-2"
                    />
                    <Field id="company" name="company" label="Bedrijf" autoComplete="organization" required />
                    <Field id="role" name="role" label="Rol" autoComplete="organization-title" />

                    <div className="sm:col-span-2">
                      <Label htmlFor="budget">Ordegrootte mediabudget</Label>
                      <select
                        id="budget"
                        name="budget"
                        defaultValue=""
                        className="mt-1.5 w-full rounded-ctl border border-site-line-ink bg-white/[0.04] px-3.5 py-2.5 text-[0.9375rem] text-white outline-none transition-colors focus:border-site-blue-ink/60"
                      >
                        <option value="">Maak een keuze</option>
                        {BUDGET_OPTIONS.map((option) => (
                          <option key={option} value={option} className="text-site-text">
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <Label htmlFor="message" optional>
                        Waar loop je nu tegenaan?
                      </Label>
                      <textarea
                        id="message"
                        name="message"
                        rows={3}
                        className="mt-1.5 w-full rounded-ctl border border-site-line-ink bg-white/[0.04] px-3.5 py-2.5 text-[0.9375rem] text-white outline-none transition-colors placeholder:text-white/30 focus:border-site-blue-ink/60"
                      />
                    </div>

                    {/* Honeypot: onzichtbaar voor mensen, ingevuld door bots. */}
                    <div aria-hidden="true" className="hidden">
                      <label htmlFor="website">Laat dit veld leeg</label>
                      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                    </div>
                  </div>

                  {error && (
                    <p
                      role="alert"
                      className="mt-5 rounded-ctl border border-white/20 bg-white/[0.06] px-4 py-3 text-[0.875rem] text-white"
                    >
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="mt-6 w-full rounded-ctl bg-site-blue px-5 py-3 text-[0.9375rem] font-medium text-white transition duration-200 hover:bg-site-blue-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {status === "sending" ? "Versturen…" : SITE.ctaPrimary}
                  </button>
                  <p className="mt-4 text-[0.75rem] leading-relaxed text-site-on-ink-faint">
                    We gebruiken je gegevens alleen om contact met je op te nemen over deze aanvraag.
                  </p>
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

function Label({
  htmlFor,
  children,
  optional = false,
}: {
  htmlFor: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="block font-mono text-[10px] uppercase tracking-[0.14em] text-site-on-ink-faint">
      {children}
      {optional && <span className="normal-case tracking-normal"> (optioneel)</span>}
    </label>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  required = false,
  autoComplete,
  className = "",
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} optional={!required}>
        {label}
      </Label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className="mt-1.5 w-full rounded-ctl border border-site-line-ink bg-white/[0.04] px-3.5 py-2.5 text-[0.9375rem] text-white outline-none transition-colors placeholder:text-white/30 focus:border-site-blue-ink/60"
      />
    </div>
  );
}
