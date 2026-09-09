import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { withJsonErrors } from "@/lib/apiRoute";
import { loadProjectSnapshot } from "@/lib/snapshot";
import { clearStepDecision, loadLedger, recordStepDecision } from "@/lib/flow/ledger";
import { appendTranscript, hasGuideFor } from "@/lib/flow/transcript";
import { availableActions, deriveFlowState } from "@/lib/flow/state";
import { STEPS, type StepAction, type StepId } from "@/lib/flow/steps";

/**
 * De enige plek waar het traject vooruit gaat.
 *
 * Hier zit de reparatie van de grootste bugcategorie uit de oude wizard (zie
 * docs/CHAT_PIPELINE_HERZIENING.md §8.1). Daar werd een keuze uit vrije tekst geraden door
 * een parser (lib/wizard/questions.ts), los van de stap waar hij bij hoorde. Een getypte "1"
 * betekende per stap iets anders, en een verouderd menu bleef gewoon geldig — er staan twee
 * bugs in de commentaren van dat bestand die daaruit voortkwamen.
 *
 * Hier is een keuze een actie-id, en de server toetst die tegen de acties die de HUIDIGE
 * toestand daadwerkelijk aanbiedt. Dat is strenger dan "hoort bij de actieve stap": het sluit
 * ook het verouderde-menu-geval uit, want een actie die inmiddels niet meer wordt aangeboden,
 * staat niet in die verzameling. Er valt niets te interpreteren, dus er valt niets verkeerd
 * te interpreteren.
 */

/** Wat fase 1 al echt afhandelt. De rest krijgt een eerlijk antwoord in plaats van stilte. */
const HANDLED_IN_PHASE_1 = new Set([
  "goal.budget",
  "goal.effect",
  "goal.report",
  "goal.change",
  "results.accept",
]);

const GOAL_SUMMARY: Record<string, string> = {
  "goal.budget": "Doel: budget beter verdelen",
  "goal.effect": "Doel: aantonen wat de kanalen opleveren",
  "goal.report": "Doel: periodiek rapporteren",
};

function stepOf(actionId: string): StepId | null {
  const prefix = actionId.split(".")[0];
  return prefix in STEPS ? (prefix as StepId) : null;
}

/**
 * Zorg dat de gids deze stap één keer heeft geopend.
 *
 * Idempotent: de tekst wordt alleen geschreven als hij er nog niet staat, zodat een refresh
 * of een terugkeer het gesprek niet laat stotteren.
 */
async function ensureOpening(projectId: string, step: StepId, userId: string): Promise<boolean> {
  if (await hasGuideFor(projectId, step)) return false;
  await appendTranscript(
    projectId,
    { role: "assistant", kind: "guide", step, text: STEPS[step].opening },
    userId,
  );
  return true;
}

async function handlePost(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isBuilder) {
    return NextResponse.json({ error: "geen toegang" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const projectId: string | undefined = body?.project_id;
  const actionId: string | undefined = body?.action_id;
  if (!projectId) {
    return NextResponse.json({ error: "project_id is verplicht" }, { status: 400 });
  }

  const snapshot = await loadProjectSnapshot(projectId);
  if (!snapshot) {
    return NextResponse.json({ error: "project niet gevonden" }, { status: 404 });
  }
  const ledger = await loadLedger(projectId);
  const state = deriveFlowState(snapshot, ledger);

  // Zonder actie: alleen de stap openen (aanroep bij het laden van de pagina).
  if (!actionId) {
    const opened = await ensureOpening(projectId, state.activeStepId, viewer.id);
    return NextResponse.json({ ok: true, opened, active_step: state.activeStepId });
  }

  // De actie moet worden aangeboden door de toestand van dít moment.
  const offered: StepAction | undefined = availableActions(state).find((a) => a.id === actionId);
  if (!offered) {
    return NextResponse.json(
      {
        error:
          "Die keuze kan nu niet meer. Er is intussen iets veranderd — ververs de pagina, dan zie je wat er nu mogelijk is.",
        active_step: state.activeStepId,
      },
      { status: 409 },
    );
  }

  const step = stepOf(actionId);
  if (!step) {
    return NextResponse.json({ error: "onbekende stap" }, { status: 400 });
  }

  // Navigatie: een stap opnieuw bekijken verandert niets aan de gegevens. Er wordt dus ook
  // niets vastgelegd — teruggaan is geen beslissing.
  if (offered.goTo) {
    return NextResponse.json({ ok: true, viewing: offered.goTo, active_step: state.activeStepId });
  }

  if (!HANDLED_IN_PHASE_1.has(actionId)) {
    return NextResponse.json(
      {
        error: `"${offered.label}" wordt in een volgende fase gebouwd. De stap zelf staat er al.`,
        active_step: state.activeStepId,
      },
      { status: 501 },
    );
  }

  // "Ander doel kiezen" neemt de beslissing terug; de stap staat daarna weer open.
  if (actionId === "goal.change") {
    await clearStepDecision(projectId, "goal");
    await appendTranscript(
      projectId,
      { role: "user", kind: "decision", step: "goal", text: "Ik wil een ander doel kiezen." },
      viewer.id,
    );
    return NextResponse.json({ ok: true, active_step: "goal" });
  }

  const summary = GOAL_SUMMARY[actionId] ?? offered.label;
  const { error } = await recordStepDecision(
    projectId,
    step,
    { action: actionId },
    summary,
    viewer.id,
  );
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  await appendTranscript(
    projectId,
    { role: "user", kind: "decision", step, text: offered.label },
    viewer.id,
  );

  // De volgende stap openen — met de verse toestand, want de beslissing hierboven kan hem
  // net hebben verschoven.
  const nextState = deriveFlowState(snapshot, await loadLedger(projectId));
  await ensureOpening(projectId, nextState.activeStepId, viewer.id);

  return NextResponse.json({ ok: true, active_step: nextState.activeStepId });
}

export const POST = withJsonErrors(handlePost);
