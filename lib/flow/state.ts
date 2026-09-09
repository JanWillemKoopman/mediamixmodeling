// De toestand van het traject: welke stap is af, welke loopt, en wat kan de gebruiker nu.
//
// Dit vervangt lib/wizard/phase.ts. Twee dingen zijn wezenlijk anders:
//
//   1. Een stap is afgerond omdat er een FEIT is dat dat zegt — niet omdat hij vóór de
//      huidige stap staat. De oude voortgangsbalk rekende `done = i < activeStep`
//      (components/wizard/ModelDossier.tsx:86), waardoor een overgeslagen stap een vinkje
//      kreeg. Hier vraagt elke stap zijn eigen `isDone()`.
//   2. Een afgeronde stap kan ACHTERHAALD raken. Wie na een berekening zijn kolomrollen
//      wijzigt, heeft een dataset en een run die niet meer bij die rollen horen. Vroeger
//      gebeurde dat stilzwijgend; hier volgt het uit de tijden — een beslissing is
//      achterhaald zodra iets waar hij van afhangt láter is beslist. Dat vraagt geen
//      bijwerkcascade en kan dus niet achterlopen.
//
// De statussen samen zijn uitputtend: elke stap is precies één van todo/blocked/active/
// waiting/done/stale. De invarianten in lib/flow/__tests__ toetsen dat over alle
// bereikbare toestanden.

import { STEPS, STEP_ORDER, type FlowContext, type Ledger, type StepAction, type StepId, type WaitingState } from "@/lib/flow/steps";
import type { ProjectSnapshot } from "@/lib/types";

export type StepStatus =
  | "todo" // nog niet aan de beurt, niets in de weg
  | "blocked" // kan nu niet, en we zeggen waarom
  | "active" // hier ben je
  | "waiting" // er loopt iets; je hoeft niets te doen
  | "done" // afgerond, en nog steeds geldig
  | "stale"; // afgerond, maar achterhaald door een latere wijziging

export interface StepState {
  id: StepId;
  number: number;
  label: string;
  purpose: string;
  status: StepStatus;
  /** Wat er in deze stap besloten is, in één regel — voor de balk. */
  summary: string | null;
  /** Alleen bij "blocked": waarom niet, in mensentaal. */
  blockedReason: string | null;
  /** Alleen bij "waiting": wat er loopt en hoe lang het hoort te duren. */
  waiting: WaitingState | null;
  /** Wat de gebruiker hier kan doen. Bij "waiting" bewust leeg. */
  actions: StepAction[];
  /** Welke eerdere stap deze achterhaald maakte — alleen bij "stale". */
  staleBecauseOf: StepId | null;
}

export interface FlowState {
  steps: StepState[];
  /** De stap waar de gebruiker nu is. Altijd precies één. */
  activeStepId: StepId;
  /** Alles afgerond en gedeeld? Ook dan zijn er nog acties (opnieuw rekenen). */
  complete: boolean;
}

/** Tijdstip waarop een stap werd afgerond — uit het feit, anders uit het grootboek. */
function decidedAt(ctx: FlowContext, id: StepId): string | null {
  const def = STEPS[id];
  return def.factDecidedAt(ctx) ?? ctx.ledger[id]?.decided_at ?? null;
}

/**
 * Is deze afgeronde stap achterhaald door een latere wijziging bovenstrooms?
 *
 * Transitief: als stap 3 na stap 4 opnieuw is gedaan, zijn 4 én alles wat van 4 afhangt
 * achterhaald. We lopen daarom in traject-volgorde en dragen de besmetting mee.
 */
function staleSource(ctx: FlowContext, id: StepId, staleSoFar: Set<StepId>): StepId | null {
  const mine = decidedAt(ctx, id);
  if (!mine) return null;
  for (const dep of STEPS[id].dependsOn) {
    if (staleSoFar.has(dep)) return dep;
    const theirs = decidedAt(ctx, dep);
    if (theirs && new Date(theirs).getTime() > new Date(mine).getTime()) return dep;
  }
  return null;
}

export function deriveFlowState(snapshot: ProjectSnapshot, ledger: Ledger): FlowState {
  const ctx: FlowContext = { snapshot, ledger };

  // Ronde 1: afgerond, achterhaald of nog niet — puur uit de feiten.
  const stale = new Set<StepId>();
  const done = new Set<StepId>();
  for (const id of STEP_ORDER) {
    const def = STEPS[id];
    if (!def.isDone(ctx)) continue;
    const because = staleSource(ctx, id, stale);
    if (because || def.stillValid?.(ctx) === false) stale.add(id);
    else done.add(id);
  }

  // De actieve stap is de eerste die niet afgerond-en-geldig is én ook niet geblokkeerd.
  // Dat "niet geblokkeerd" is wezenlijk: een model dat de drempel voor delen niet haalt,
  // zet de gebruiker niet bij stap 8 met een grijze knop — hij staat gewoon nog bij de
  // uitkomst, waar de twee echte uitwegen liggen. Blijft er niets over, dan is dat de
  // laatste stap die wél is afgerond; daar staat wat er nog te doen valt.
  const openSteps = STEP_ORDER.filter((id) => !done.has(id));
  const activeStepId =
    openSteps.find((id) => STEPS[id].blockedReason(ctx) == null) ??
    [...STEP_ORDER].reverse().find((id) => done.has(id) || stale.has(id)) ??
    STEP_ORDER[0];

  const steps: StepState[] = STEP_ORDER.map((id) => {
    const def = STEPS[id];
    const isActive = id === activeStepId;
    const waiting = def.waiting(ctx);
    const blockedReason = def.blockedReason(ctx);

    // "Hier ben je" gaat vóór elke andere status: een afgeronde stap waar de gebruiker naar
    // is teruggekeerd, toont zich als de stap waar hij staat — niet als een vinkje.
    let status: StepStatus;
    if (isActive) status = waiting ? "waiting" : "active";
    else if (stale.has(id)) status = "stale";
    else if (done.has(id)) status = "done";
    else if (blockedReason) status = "blocked";
    else status = "todo";

    return {
      id,
      number: def.number,
      label: def.label,
      purpose: def.purpose,
      status,
      summary: ledger[id]?.summary ?? null,
      blockedReason: status === "blocked" ? blockedReason : null,
      waiting: status === "waiting" ? waiting : null,
      // Tijdens het wachten is er niets te kiezen; buiten het wachten mag elke zichtbare
      // stap zijn eigen acties aanbieden, ook een afgeronde (terugkoppeling).
      actions: status === "waiting" ? [] : def.actions(ctx),
      staleBecauseOf: stale.has(id) ? staleSource(ctx, id, stale) : null,
    };
  });

  return {
    steps,
    activeStepId,
    complete: done.has("share"),
  };
}

/** De stap waar de gebruiker nu is. */
export function activeStep(state: FlowState): StepState {
  return state.steps.find((s) => s.id === state.activeStepId)!;
}

/**
 * Wat de gebruiker nu kan doen — over het hele traject, niet alleen de actieve stap.
 *
 * Dit is de functie waar invariant §8.2.1 op rust: nooit een doodlopende toestand. Loopt er
 * iets, dan is de lege lijst het juiste antwoord en vertelt `waiting` wat er gebeurt.
 */
export function availableActions(state: FlowState): StepAction[] {
  return state.steps.flatMap((s) => s.actions);
}
