"use client";

import { useState } from "react";
import { SITE } from "@/lib/site/copy";
import { Reveal } from "./motion";
import { Container, Label } from "./primitives";

/**
 * De enige conversie op de site. Vraagt precies genoeg voor een zinnig eerste gesprek en geen
 * veld meer: gewone <form> met echte labels, zichtbare foutmelding en een verborgen
 * honeypot-veld tegen bots. De aanvraag gaat naar /api/demo-request.
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
    const payload = { ...data, name: [data.firstName, data.lastName].filter(Boolean).join(" ").trim() };

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
      className="site-anchor u-wash relative isolate overflow-hidden border-t border-site-line bg-site-paper py-20 sm:py-24 lg:py-32"
    >
      <Container className="relative">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-20">
          <Reveal>
            <Label>Hoofdstuk 08 · tot slot</Label>
            <h2 id="demo-titel" className="u-display u-h2 mt-6 max-w-[16ch] text-site-ink">
              Weet wat je
              <br />
              <span className="u-grad">mediabudget doet.</span>
            </h2>
            <p className="u-sub mt-7">
              Je hebt waarschijnlijk al genoeg data. De vraag is wat je ermee kunt begrijpen. Media
              Mix Modeling brengt je mediabestedingen, bedrijfsresultaat en andere invloeden samen,
              zodat je je volgende budgetbeslissing beter kunt onderbouwen.
            </p>
            <p className="mt-5 text-[0.9375rem] leading-relaxed text-site-muted">
              In ongeveer 30 minuten laten we zien hoe zo&rsquo;n analyse eruitziet en welke vragen
              je ermee kunt beantwoorden.
            </p>

            <div className="mt-10 border-t border-site-line pt-8">
              <Label tone="muted">Wat we in het gesprek bekijken</Label>
              <ul className="mt-5 space-y-3">
                {[
                  "Hoe een analyse op een voorbeelddataset eruitziet, van bestedingen tot geschatte bijdrage.",
                  "Welke data je zelf al hebt en wat er nodig is om ermee te rekenen.",
                  "Welke vragen over je budgetverdeling je ermee kunt beantwoorden — en welke niet.",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-[0.9375rem] leading-relaxed text-site-muted">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-site-green-text" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="u-card u-card-md p-5 sm:p-7">
              {status === "sent" ? (
                <div role="status">
                  <h3 className="u-display u-h3 text-site-ink">Je aanvraag staat genoteerd.</h3>
                  <p className="mt-4 text-[0.9375rem] leading-relaxed text-site-muted">
                    We nemen binnen twee werkdagen contact op om een moment te plannen. Wil je in de
                    tussentijd iets toevoegen, reageer dan gewoon op onze mail.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatus("idle")}
                    className="mt-6 text-[0.875rem] font-semibold text-site-violet underline underline-offset-4"
                  >
                    Nog een aanvraag versturen
                  </button>
                </div>
              ) : (
                <form onSubmit={onSubmit}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[1.0625rem] font-bold tracking-[-0.01em] text-site-ink">{SITE.ctaPrimary}</h3>
                    <span className="u-label-sm u-label text-site-muted-2">± 30 min</span>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <Field id="firstName" name="firstName" label="Voornaam" autoComplete="given-name" required />
                    <Field id="lastName" name="lastName" label="Achternaam" autoComplete="family-name" required />
                    <Field id="email" name="email" label="Zakelijk e-mailadres" type="email" autoComplete="email" required className="sm:col-span-2" />
                    <Field id="company" name="company" label="Bedrijf" autoComplete="organization" required />
                    <Field id="role" name="role" label="Rol" autoComplete="organization-title" />

                    <div className="sm:col-span-2">
                      <FieldLabel htmlFor="budget">Ordegrootte mediabudget</FieldLabel>
                      <select id="budget" name="budget" defaultValue="" className={FIELD_CLASS}>
                        <option value="">Maak een keuze</option>
                        {BUDGET_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <FieldLabel htmlFor="message" optional>
                        Waar loop je nu tegenaan?
                      </FieldLabel>
                      <textarea id="message" name="message" rows={3} className={FIELD_CLASS} />
                    </div>

                    {/* Honeypot: onzichtbaar voor mensen, ingevuld door bots. */}
                    <div aria-hidden="true" className="hidden">
                      <label htmlFor="website">Laat dit veld leeg</label>
                      <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                    </div>
                  </div>

                  {error && (
                    <p role="alert" className="u-inset mt-5 px-4 py-3 text-[0.875rem] text-site-ink">
                      {error}
                    </p>
                  )}

                  <button type="submit" disabled={status === "sending"} className="u-btn u-btn-primary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60">
                    {status === "sending" ? "Versturen…" : SITE.ctaPrimary}
                  </button>
                  <p className="mt-4 text-[0.75rem] leading-relaxed text-site-muted-2">
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

const FIELD_CLASS =
  "mt-2 w-full rounded-ctl border border-site-line bg-site-paper-2 px-3.5 py-2.5 text-[0.9375rem] text-site-ink outline-none transition-colors focus:border-site-violet-line focus:bg-site-paper";

function FieldLabel({ htmlFor, children, optional = false }: { htmlFor: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="u-label-sm u-label text-site-muted-2">
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
      <FieldLabel htmlFor={id} optional={!required}>
        {label}
      </FieldLabel>
      <input id={id} name={name} type={type} required={required} autoComplete={autoComplete} className={FIELD_CLASS} />
    </div>
  );
}
