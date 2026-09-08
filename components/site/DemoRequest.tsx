"use client";

import { useState } from "react";
import { FIT_CRITERIA, SITE } from "@/lib/site/copy";

const BUDGET_OPTIONS = [
  "Tot € 500.000 per jaar",
  "€ 500.000 – € 2 mln per jaar",
  "€ 2 mln – € 10 mln per jaar",
  "Meer dan € 10 mln per jaar",
  "Liever nog niet zeggen",
];

type Status = "idle" | "sending" | "sent" | "error";

/**
 * De enige conversie op deze pagina. Vraagt precies genoeg om een zinnig eerste gesprek te
 * voeren en geen veld meer. Het formulier is een gewone <form> met echte labels en een
 * zichtbare foutmelding; het verborgen honeypot-veld vangt bots af zonder de bezoeker met
 * een puzzel op te zadelen.
 */
export function DemoRequest() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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
    <section id="demo" className="site-anchor site-grain relative bg-site-ink text-site-on-ink" aria-labelledby="demo-titel">
      <div className="mx-auto max-w-[80rem] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2
              id="demo-titel"
              className="max-w-xl font-display text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.06] tracking-tight"
            >
              Begin bij één vraag: wat doet ons mediabudget?
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-site-on-ink-muted">
              In een demo van een half uur laten we op een voorbeeldanalyse zien hoe het effect van
              een mediabudget zichtbaar wordt, en bespreken we wat er voor jouw situatie nodig is.
              Geen verkooppraatje over techniek — een gesprek over je budgetverdeling.
            </p>

            <ul className="mt-10 space-y-3 border-t border-site-line-ink pt-8">
              {FIT_CRITERIA.map((criterion) => (
                <li key={criterion} className="flex gap-3 text-base leading-relaxed text-site-on-ink-muted">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-site-effect-ink" />
                  {criterion}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-site-line-ink bg-site-ink-2 p-6 sm:p-9">
            {status === "sent" ? (
              <div role="status">
                <h3 className="font-display text-2xl tracking-tight">Je aanvraag staat genoteerd.</h3>
                <p className="mt-3 text-base leading-relaxed text-site-on-ink-muted">
                  We nemen binnen twee werkdagen contact op om een moment te plannen. Heb je in de
                  tussentijd nog iets toe te voegen, dan kun je gewoon reageren op onze mail.
                </p>
                <button
                  type="button"
                  onClick={() => setStatus("idle")}
                  className="mt-6 text-sm text-site-effect-ink underline underline-offset-4"
                >
                  Nog een aanvraag versturen
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate={false}>
                <h3 className="font-display text-2xl tracking-tight">{SITE.ctaPrimary}</h3>

                <div className="mt-6 space-y-5">
                  <Field id="name" name="name" label="Naam" autoComplete="name" required />
                  <Field
                    id="email"
                    name="email"
                    label="Zakelijk e-mailadres"
                    type="email"
                    autoComplete="email"
                    required
                  />
                  <Field id="company" name="company" label="Bedrijf" autoComplete="organization" required />
                  <Field id="role" name="role" label="Je rol" autoComplete="organization-title" />

                  <div>
                    <label htmlFor="budget" className="block text-sm text-site-on-ink-muted">
                      Orde van grootte mediabudget
                    </label>
                    <select
                      id="budget"
                      name="budget"
                      defaultValue=""
                      className="mt-1.5 w-full rounded-xl border border-site-line-ink bg-white/[0.04] px-4 py-3 text-base text-site-on-ink outline-none focus-visible:ring-2 focus-visible:ring-site-effect-ink"
                    >
                      <option value="">Maak een keuze</option>
                      {BUDGET_OPTIONS.map((option) => (
                        <option key={option} value={option} className="text-site-text">
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm text-site-on-ink-muted">
                      Waar loop je nu tegenaan? <span className="text-white/60">(optioneel)</span>
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={3}
                      className="mt-1.5 w-full rounded-xl border border-site-line-ink bg-white/[0.04] px-4 py-3 text-base text-site-on-ink outline-none focus-visible:ring-2 focus-visible:ring-site-effect-ink"
                    />
                  </div>

                  {/* Honeypot: onzichtbaar voor mensen, ingevuld door bots. */}
                  <div aria-hidden="true" className="hidden">
                    <label htmlFor="website">Laat dit veld leeg</label>
                    <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                  </div>
                </div>

                {error && (
                  <p role="alert" className="mt-5 rounded-xl border border-site-accent/40 bg-site-accent/10 px-4 py-3 text-sm text-white">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="mt-7 w-full rounded-full bg-site-effect-ink px-6 py-3.5 text-base font-medium text-site-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === "sending" ? "Versturen…" : SITE.ctaPrimary}
                </button>
                <p className="mt-4 text-xs leading-relaxed text-white/60">
                  We gebruiken je gegevens alleen om contact met je op te nemen over deze aanvraag.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

interface FieldProps {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}

function Field({ id, name, label, type = "text", required = false, autoComplete }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-site-on-ink-muted">
        {label}
        {!required && <span className="text-white/60"> (optioneel)</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className="mt-1.5 w-full rounded-xl border border-site-line-ink bg-white/[0.04] px-4 py-3 text-base text-site-on-ink outline-none placeholder:text-white/30 focus-visible:ring-2 focus-visible:ring-site-effect-ink"
      />
    </div>
  );
}
