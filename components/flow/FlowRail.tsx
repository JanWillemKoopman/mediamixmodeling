"use client";

// De stappenbalk: waar sta je, wat heb je besloten, wat komt er nog.
//
// Vervangt de voortgangslijst uit components/wizard/ModelDossier.tsx, die `done = i <
// activeStep` rekende en dus een vinkje zette bij een stap die de gebruiker had overgeslagen.
// Hier komt elke status uit lib/flow/state.ts, en dus uit de feiten.
//
// Twee dingen die deze balk toont en de oude niet kon:
//   * de samenvatting van wat er in een afgeronde stap besloten is — "waar ben ik" is de
//     halve vraag, "wat heb ik gekozen" de andere helft;
//   * achterhaalde stappen, mét de reden. Wie na een berekening zijn kolommen wijzigt, zag
//     vroeger niets veranderen terwijl zijn resultaat er niet meer bij hoorde.

import { Check, ChevronRight, CircleAlert, CircleDot, Loader2, Lock } from "lucide-react";
import type { StepState, StepStatus } from "@/lib/flow/state";
import { STEPS } from "@/lib/flow/steps";

const ICON: Record<StepStatus, React.ReactNode> = {
  done: <Check className="h-3.5 w-3.5 text-success" />,
  stale: <CircleAlert className="h-3.5 w-3.5 text-warn" />,
  active: <CircleDot className="h-3.5 w-3.5 text-accent" />,
  waiting: <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />,
  blocked: <Lock className="h-3 w-3 text-fg-faint" />,
  todo: <span className="ml-0.5 h-2 w-2 rounded-full border border-border" />,
};

const TEXT_TONE: Record<StepStatus, string> = {
  done: "text-fg-muted",
  stale: "text-warn",
  active: "font-medium text-fg",
  waiting: "font-medium text-fg",
  blocked: "text-fg-faint",
  todo: "text-fg-faint",
};

export function FlowRail({
  steps,
  viewingStepId,
  onSelect,
}: {
  steps: StepState[];
  /** Welke stap de gebruiker op dit moment bekijkt — kan een eerdere zijn dan de actieve. */
  viewingStepId: string;
  onSelect: (stepId: string) => void;
}) {
  return (
    <nav aria-label="Voortgang" className="space-y-1">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
        Jouw traject
      </h2>
      <ol className="space-y-0.5">
        {steps.map((step) => {
          const viewing = step.id === viewingStepId;
          // Een stap die nog niet aan de beurt is, is niet te openen: erheen klikken zou een
          // scherm tonen waar niets te doen valt.
          const reachable = step.status !== "todo" && step.status !== "blocked";
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onSelect(step.id)}
                aria-current={viewing ? "step" : undefined}
                title={step.blockedReason ?? STEPS[step.id].purpose}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                  viewing ? "bg-surface-3" : reachable ? "hover:bg-surface-2" : "cursor-default"
                }`}
              >
                <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center">
                  {ICON[step.status]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block ${TEXT_TONE[step.status]}`}>
                    {step.number}. {step.label}
                  </span>
                  {/* Wat er besloten is — het antwoord op "wat heb ik ook alweer gekozen". */}
                  {step.summary && step.status !== "active" && (
                    <span className="mt-0.5 block truncate text-[11px] text-fg-faint">{step.summary}</span>
                  )}
                  {step.status === "stale" && (
                    <span className="mt-0.5 block text-[11px] text-warn">
                      Achterhaald
                      {step.staleBecauseOf ? ` — je hebt "${STEPS[step.staleBecauseOf].label}" gewijzigd` : ""}
                    </span>
                  )}
                  {step.status === "waiting" && step.waiting && (
                    <span className="mt-0.5 block text-[11px] text-fg-faint">{step.waiting.stage}…</span>
                  )}
                  {step.status === "blocked" && step.blockedReason && (
                    <span className="mt-0.5 block text-[11px] text-fg-faint">{step.blockedReason}</span>
                  )}
                </span>
                {viewing && <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-none text-fg-faint" />}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
