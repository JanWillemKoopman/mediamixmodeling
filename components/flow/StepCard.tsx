"use client";

// De stapkaart: wat kun je hier doen.
//
// De knoppen worden gerenderd uit de acties die de stap zelf declareert
// (lib/flow/steps.ts). Dat is geen implementatiedetail maar de reparatie van een hele
// bugcategorie: in de oude wizard stond de tekst los van de mogelijkheden, en beloofde de
// tuning-stap een "gratis proefdraai" en "geavanceerde rekeninstellingen" die nergens
// bestonden. Hier kán een knop die niet bestaat niet in beeld komen.
//
// Een handeling met een blijvend gevolg gaat eerst langs een bevestiging die zegt wát er
// gaat gebeuren — de vlag daarvoor zit op de actie, niet op deze component, en een test
// bewaakt dat precies de blijvende handelingen hem dragen.

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Loader2 } from "lucide-react";
import type { StepState } from "@/lib/flow/state";
import type { StepAction } from "@/lib/flow/steps";

function Elapsed({ since, stallAfterMinutes, expectation }: { since: string | null; stallAfterMinutes: number; expectation: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const minutes = since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000)) : 0;
  const stalled = since != null && minutes >= stallAfterMinutes;
  return (
    <div className="space-y-2">
      <p className="text-xs text-fg-faint">
        {minutes === 0 ? "net begonnen" : `${minutes} min bezig`} · {expectation}
      </p>
      {stalled && (
        <p className="rounded-lg border border-warn/30 bg-warn-dim px-3 py-2 text-xs text-warn">
          Dit duurt langer dan het hoort. Ververs de pagina; blijft het hangen, laat het me weten —
          er hoeft niets van je werk verloren te gaan.
        </p>
      )}
    </div>
  );
}

export function StepCard({
  step,
  busy,
  error,
  onAction,
}: {
  step: StepState;
  busy: boolean;
  error: string | null;
  onAction: (action: StepAction) => void;
}) {
  const [confirming, setConfirming] = useState<StepAction | null>(null);

  // Wisselt de stap, dan hoort een openstaande bevestiging niet mee te reizen: hij ging over
  // iets anders.
  useEffect(() => setConfirming(null), [step.id, step.status]);

  if (step.status === "waiting" && step.waiting) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-fg">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          {step.waiting.stage}
        </p>
        <div className="mt-2">
          <Elapsed
            since={step.waiting.since}
            stallAfterMinutes={step.waiting.stallAfterMinutes}
            expectation={step.waiting.expectation}
          />
        </div>
      </div>
    );
  }

  if (step.status === "blocked") {
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Clock className="mt-0.5 h-4 w-4 flex-none text-fg-faint" />
          {step.blockedReason}
        </p>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="rounded-xl border border-strong bg-surface-2 p-4">
        <p className="flex items-start gap-2 text-sm text-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-warn" />
          <span>{confirming.confirmPrompt}</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const action = confirming;
              setConfirming(null);
              onAction(action);
            }}
            className="rounded-full bg-accent px-4 py-2 text-sm text-bg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirming.label}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="rounded-full border border-border px-4 py-2 text-sm text-fg-muted transition hover:bg-surface-3"
          >
            Nee, terug
          </button>
        </div>
      </div>
    );
  }

  if (step.actions.length === 0) return null;

  return (
    <div className="space-y-2">
      {step.status === "stale" && (
        <p className="rounded-lg border border-warn/30 bg-warn-dim px-3 py-2 text-xs text-warn">
          Je hebt hierboven iets gewijzigd, dus wat hier stond klopt niet meer. Doe deze stap opnieuw.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {step.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={busy}
            onClick={() => (action.confirms ? setConfirming(action) : onAction(action))}
            className={
              "rounded-full px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 " +
              (action.tone === "primary"
                ? "bg-accent text-bg hover:bg-accent-hover"
                : "border border-border text-fg-muted hover:bg-surface-3")
            }
          >
            {action.label}
          </button>
        ))}
      </div>
      {busy && <p className="text-xs text-fg-faint">Even geduld…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
