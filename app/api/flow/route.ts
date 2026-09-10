import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getViewer } from "@/lib/auth";
import { withJsonErrors } from "@/lib/apiRoute";
import { loadProjectSnapshot } from "@/lib/snapshot";
import { createClient } from "@/lib/supabase/server";
import { buildSourceProfile } from "@/lib/dataProfile";
import { approveDatasetVersion, createDatasetVersion } from "@/lib/datasets";
import { clearStepDecision, loadLedger, recordStepDecision } from "@/lib/flow/ledger";
import { appendTranscript, hasGuideFor } from "@/lib/flow/transcript";
import { availableActions, deriveFlowState } from "@/lib/flow/state";
import { buildRecipe, type FindingChoices } from "@/lib/flow/recipe";
import { buildIntent, channelsOf, type BeliefAnswers } from "@/lib/flow/beliefs";
import { createConfiguration, startModelRun } from "@/lib/runs";
import { STEPS, type Ledger, type StepAction, type StepId } from "@/lib/flow/steps";
import { validateIntent } from "@/lib/modelIntent";
import type { ColumnMapping, KpiType, ProjectSnapshot, SourceProfile } from "@/lib/types";

/**
 * De enige plek waar het traject vooruit gaat.
 *
 * Hier zit de reparatie van de grootste bugcategorie uit de oude wizard (zie
 * docs/CHAT_PIPELINE_HERZIENING.md §8.1). Daar werd een keuze uit vrije tekst geraden door
 * een parser (lib/wizard/questions.ts), los van de stap waar hij bij hoorde. Een getypte "1"
 * betekende per stap iets anders, en een verouderd menu bleef gewoon geldig.
 *
 * Hier is een keuze een actie-id, en de server toetst die tegen de acties die de HUIDIGE
 * toestand daadwerkelijk aanbiedt. Dat is strenger dan "hoort bij de actieve stap": het sluit
 * ook het verouderde-menu-geval uit, want een actie die inmiddels niet meer wordt aangeboden,
 * staat niet in die verzameling. Er valt niets te interpreteren, dus er valt niets verkeerd
 * te interpreteren.
 */

export const maxDuration = 60;

const DEMO_FILE = "mediamarkt_demo_dataset.csv";
const BUCKET = "mmm-raw-data";

interface HandlerContext {
  projectId: string;
  userId: string;
  snapshot: ProjectSnapshot;
  /** Wat er in eerdere stappen is besloten — stap 6 leest hier stap 1 en 5 uit. */
  ledger: Ledger;
  action: StepAction;
  payload: Record<string, unknown>;
}

interface HandlerResult {
  /** Wat er in het grootboek komt te staan; weglaten als deze actie geen beslissing is. */
  decision?: { step: StepId; data: Record<string, unknown>; summary: string };
  /** Wat er in het transcript komt als de zet van de gebruiker. */
  note?: string;
  error?: string;
  status?: number;
}

// --- de handlers per actie --------------------------------------------------------------

const GOAL_AIM: Record<string, { aim: string; summary: string }> = {
  "goal.budget": { aim: "budget", summary: "Doel: budget beter verdelen" },
  "goal.effect": { aim: "effect", summary: "Doel: aantonen wat de kanalen opleveren" },
  "goal.report": { aim: "report", summary: "Doel: periodiek rapporteren" },
};

const GOAL_KPI: Record<string, { kpi_type: string; label: string }> = {
  "goal.kpi_revenue": { kpi_type: "revenue", label: "omzet in euro's" },
  "goal.kpi_orders": { kpi_type: "orders", label: "aantal bestellingen" },
  "goal.kpi_leads": { kpi_type: "leads", label: "aantal leads" },
  "goal.kpi_sessions": { kpi_type: "sessions", label: "aantal bezoeken" },
};

async function handleGoal(ctx: HandlerContext): Promise<HandlerResult> {
  const existing = ctx.ledger.goal?.decision ?? {};

  const aim = GOAL_AIM[ctx.action.id];
  if (aim) {
    return {
      decision: { step: "goal", data: { ...existing, aim: aim.aim }, summary: aim.summary },
      note: ctx.action.label,
    };
  }

  const kpi = GOAL_KPI[ctx.action.id];
  if (kpi) {
    const base = (existing.summary as string) ?? "";
    const aimSummary =
      Object.values(GOAL_AIM).find((g) => g.aim === existing.aim)?.summary ?? base ?? "Doel";
    return {
      decision: {
        step: "goal",
        data: { ...existing, kpi_type: kpi.kpi_type },
        summary: `${aimSummary} · ${kpi.label}`,
      },
      note: ctx.action.label,
    };
  }
  return { error: "onbekende keuze", status: 400 };
}

/** Het meegeleverde demobestand als bron registreren — precies zoals een echte upload. */
async function handleDemo(ctx: HandlerContext): Promise<HandlerResult> {
  let csv: string;
  try {
    csv = await fs.readFile(path.join(process.cwd(), "demo_data", DEMO_FILE), "utf8");
  } catch {
    return { error: "De demo-dataset staat niet op de server.", status: 503 };
  }

  const supabase = createClient();
  const storagePath = `${ctx.projectId}/${Date.now()}-${DEMO_FILE}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, new Blob([csv], { type: "text/csv" }));
  if (uploadError) return { error: uploadError.message, status: 400 };

  let profile: SourceProfile | null = null;
  try {
    const parsed = Papa.parse<Record<string, unknown>>(csv, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });
    const columns = parsed.meta.fields ?? [];
    if (columns.length > 0 && parsed.data.length > 0) profile = buildSourceProfile(columns, parsed.data);
  } catch {
    // Zonder profiel werkt de rest gewoon door; de kolomstap laat het dan zelf uitzoeken.
  }

  const { error } = await supabase
    .schema("mmm")
    .from("source_files")
    .insert({
      project_id: ctx.projectId,
      name: DEMO_FILE,
      storage_path: storagePath,
      preview: csv.split("\n").slice(0, 15).join("\n"),
      profile,
    });
  if (error) return { error: error.message, status: 400 };
  return { note: "Ik gebruik de demo-dataset." };
}

/**
 * Het bestand vervangen.
 *
 * Ook de datasetversies die erop gebouwd waren gaan weg — maar alleen die waar geen
 * berekening aan hangt. Een resultaat weggooien omdat iemand een ander bestand kiest, zou
 * meer verwijderen dan gevraagd; die versies blijven staan en worden vanzelf zichtbaar als
 * achterhaald.
 */
async function handleReplace(ctx: HandlerContext): Promise<HandlerResult> {
  const source = ctx.snapshot.sources[0];
  if (!source) return { error: "Er is geen bestand om te vervangen.", status: 409 };

  const supabase = createClient();
  const usedIds = new Set(ctx.snapshot.runs.map((r) => r.run.dataset_version_id));
  const { data: datasets } = await supabase
    .schema("mmm")
    .from("dataset_versions")
    .select("id")
    .eq("project_id", ctx.projectId);
  const removable = (datasets ?? []).map((d) => d.id as string).filter((id) => !usedIds.has(id));
  if (removable.length > 0) {
    await supabase.schema("mmm").from("dataset_versions").delete().in("id", removable);
  }

  await supabase.storage.from(BUCKET).remove([source.storage_path]);
  const { error } = await supabase.schema("mmm").from("source_files").delete().eq("id", source.id);
  if (error) return { error: error.message, status: 400 };
  return { note: "Ik wil een ander bestand gebruiken." };
}

async function handleConfirmColumns(ctx: HandlerContext): Promise<HandlerResult> {
  const source = ctx.snapshot.sources[0];
  if (!source) return { error: "Er is nog geen bestand.", status: 409 };

  const mapping = (ctx.payload.mapping as ColumnMapping | undefined) ?? source.mapping;
  if (!mapping) return { error: "Ik weet nog niet wat de kolommen betekenen.", status: 400 };

  // Dezelfde eisen als de kaart toont. Hier nog een keer, omdat een client-side controle
  // geen controle is: dit is de kant die telt.
  const count = (role: string) => mapping.columns.filter((c) => c.role === role).length;
  if (count("date") !== 1) return { error: "Kies precies één datumkolom.", status: 400 };
  if (count("kpi") !== 1) return { error: "Kies precies één kolom als je resultaat.", status: 400 };
  if (count("spend") === 0) return { error: "Kies minstens één kanaal.", status: 400 };

  const supabase = createClient();
  const { error } = await supabase
    .schema("mmm")
    .from("source_files")
    .update({ mapping, inspection_confirmed_at: new Date().toISOString() })
    .eq("id", source.id);
  if (error) return { error: error.message, status: 400 };

  const kpi = mapping.columns.find((c) => c.role === "kpi")?.name ?? "?";
  const channels = count("spend");
  return {
    decision: {
      step: "columns",
      data: { kpi, channels },
      summary: `${kpi} · ${channels} kanalen`,
    },
    note: "Ja, dit klopt.",
  };
}

async function handlePrepare(ctx: HandlerContext): Promise<HandlerResult> {
  const source = ctx.snapshot.sources[0];
  if (!source) return { error: "Er is nog geen bestand.", status: 409 };

  const choices = (ctx.payload.choices as FindingChoices | undefined) ?? {};
  const { recipe, problem } = buildRecipe(source, source.mapping, choices);
  if (!recipe) return { error: problem ?? "Ik kan hier geen weektabel van maken.", status: 400 };

  const result = await createDatasetVersion(createClient(), ctx.projectId, recipe, ctx.userId);
  if (result.error) return { error: result.error, status: result.status };

  const chosen = Object.entries(choices).filter(([, c]) => c !== "keep").length;
  return {
    note:
      chosen === 0
        ? "Maak mijn data klaar."
        : `Maak mijn data klaar, met ${chosen} aanpassing${chosen === 1 ? "" : "en"}.`,
  };
}

async function handleApprove(ctx: HandlerContext): Promise<HandlerResult> {
  const dataset = ctx.snapshot.dataset;
  if (!dataset) return { error: "Er is nog geen klaargemaakte data.", status: 409 };

  const { error, status } = await approveDatasetVersion(createClient(), dataset.id, ctx.userId);
  if (error) return { error, status };

  return {
    decision: {
      step: "prepare",
      data: { dataset_version_id: dataset.id },
      summary: `${dataset.n_weeks ?? "?"} weken goedgekeurd`,
    },
    note: "Dit ziet er goed uit.",
  };
}

/**
 * Stap 5 vastleggen.
 *
 * De antwoorden gaan als antwoorden het grootboek in, niet als afgeleide modelinstellingen.
 * Dat is bewust: een volgende berekening op nieuwe data moet de intentie opnieuw kunnen
 * afleiden. Wie de uitkomst van de afleiding bewaart, zet de afstemming vast op de oude data.
 */
async function handleBeliefs(ctx: HandlerContext): Promise<HandlerResult> {
  const dataset = ctx.snapshot.approvedDataset;
  if (!dataset) return { error: "Keur je data eerst goed.", status: 409 };

  // "Ik weet het nog niet" is een volwaardig antwoord: alles op unknown, en de data bepaalt
  // alles. Geen stille middenwaarde die de gebruiker nooit heeft gekozen.
  const answers: BeliefAnswers =
    ctx.action.id === "beliefs.unknown"
      ? { channels: {} }
      : ((ctx.payload.answers as BeliefAnswers | undefined) ?? { channels: {} });

  const kpiType = (ctx.ledger.goal?.decision.kpi_type as KpiType | undefined) ?? "revenue";
  // Nu al bouwen en laten keuren, zodat een onsamenhangende afstemming hier stukloopt en niet
  // pas bij het starten van de berekening.
  const intent = buildIntent(dataset, kpiType, answers);
  const problems = validateIntent(intent, dataset.column_roles ?? {});
  if (problems.length > 0) return { error: problems[0], status: 400 };

  // De vrije tekst over het bedrijf hoort niet alleen in de intentie thuis maar ook in
  // mmm.project_context: daar leest de gids hem (lib/ai/guide.ts factsBlock), en een volgende
  // berekening op nieuwe data kan er opnieuw uit afleiden. Alleen in de intentie zetten zou
  // hem opsluiten in één configuratie.
  if (answers.context?.trim()) {
    const supabase = createClient();
    await supabase
      .schema("mmm")
      .from("project_context")
      .upsert(
        {
          project_id: ctx.projectId,
          description: answers.context.trim(),
          updated_by: ctx.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id" },
      );
  }

  const channels = channelsOf(dataset);
  const answered = channels.filter((c) => {
    const a = answers.channels[c.name];
    return a?.carryover != null || a?.strength != null || a?.saturation != null;
  }).length;

  return {
    decision: {
      step: "beliefs",
      data: { answers: answers as unknown as Record<string, unknown> },
      summary:
        answered === 0
          ? "Geen verwachtingen — de data bepaalt alles"
          : `Verwachtingen voor ${answered} van ${channels.length} kanalen`,
    },
    note: ctx.action.id === "beliefs.unknown" ? ctx.action.label : "Dit is wat ik weet.",
  };
}

/** Stap 6: de afstemming vastleggen en de berekening starten. Twee stappen, één bevestiging. */
async function handleLaunch(ctx: HandlerContext): Promise<HandlerResult> {
  const dataset = ctx.snapshot.approvedDataset;
  if (!dataset) return { error: "Keur je data eerst goed.", status: 409 };

  const answers = (ctx.ledger.beliefs?.decision.answers as BeliefAnswers | undefined) ?? null;
  if (!answers) return { error: "Beantwoord eerst de vragen over je kanalen.", status: 409 };

  const kpiType = (ctx.ledger.goal?.decision.kpi_type as KpiType | undefined) ?? "revenue";
  const intent = buildIntent(dataset, kpiType, answers);

  const supabase = createClient();
  const configured = await createConfiguration(supabase, ctx.projectId, dataset.id, intent, ctx.userId);
  if (configured.error || !configured.configurationId) {
    return { error: configured.error ?? "De afstemming kon niet worden vastgelegd.", status: configured.status };
  }

  const started = await startModelRun(supabase, ctx.projectId, configured.configurationId, ctx.userId);
  if (started.error) return { error: started.error, status: started.status };

  return {
    note: started.reused
      ? "Start de berekening. (Deze bestond al — precies dezelfde afstemming op dezelfde data, dus ik toon die.)"
      : "Start de berekening.",
  };
}

/**
 * Publiceren naar het klantdashboard.
 *
 * Gaat via `mmm.publish_run()`: die functie weigert een run die zijn eigen drempel niet haalt,
 * en dat is de grens die telt. De knop verschijnt hier al niet zonder toestemming, maar een
 * knop die niet verschijnt is geen beveiliging.
 */
async function handlePublish(ctx: HandlerContext): Promise<HandlerResult> {
  const run = ctx.snapshot.runs.find((r) => r.run.state === "completed");
  if (!run) return { error: "Er is geen afgerond resultaat om te delen.", status: 409 };

  const supabase = createClient();
  const { error } = await supabase.schema("mmm").rpc("publish_run", {
    p_project_id: ctx.projectId,
    p_model_run_id: run.run.id,
  });
  if (error) return { error: error.message, status: 409 };

  return {
    decision: {
      step: "share",
      data: { model_run_id: run.run.id },
      summary: "Gedeeld met de klant",
    },
    note: "Deel met de klant.",
  };
}

async function handleAcceptResults(ctx: HandlerContext): Promise<HandlerResult> {
  return {
    decision: { step: "results", data: { seen: true }, summary: "Uitkomst bekeken" },
    note: ctx.action.label,
  };
}

async function handleChangeGoal(ctx: HandlerContext): Promise<HandlerResult> {
  await clearStepDecision(ctx.projectId, "goal");
  return { note: "Ik wil een ander doel kiezen." };
}

type Handler = (ctx: HandlerContext) => Promise<HandlerResult>;

const HANDLERS: Record<string, Handler> = {
  "goal.budget": handleGoal,
  "goal.effect": handleGoal,
  "goal.report": handleGoal,
  "goal.kpi_revenue": handleGoal,
  "goal.kpi_orders": handleGoal,
  "goal.kpi_leads": handleGoal,
  "goal.kpi_sessions": handleGoal,
  "goal.change": handleChangeGoal,
  "data.demo": handleDemo,
  "data.replace": handleReplace,
  "data.continue": async () => ({ note: "Verder met dit bestand." }),
  "columns.confirm": handleConfirmColumns,
  "prepare.start": handlePrepare,
  "prepare.retry": handlePrepare,
  "prepare.rebuild": handlePrepare,
  "prepare.approve": handleApprove,
  "beliefs.confirm": handleBeliefs,
  "beliefs.unknown": handleBeliefs,
  "launch.start": handleLaunch,
  "launch.retry": handleLaunch,
  "launch.again": handleLaunch,
  "results.accept": handleAcceptResults,
  "share.publish": handlePublish,
};

// --- de route zelf -------------------------------------------------------------------

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
  const payload = (body?.payload as Record<string, unknown> | undefined) ?? {};
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
  const action = availableActions(state).find((a) => a.id === actionId);
  if (!action) {
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
  if (!step) return NextResponse.json({ error: "onbekende stap" }, { status: 400 });

  // Navigatie verandert niets aan de gegevens; er wordt dus ook niets vastgelegd.
  if (action.goTo) {
    return NextResponse.json({ ok: true, viewing: action.goTo, active_step: state.activeStepId });
  }
  // Een lokale actie hoort in de kaart te blijven. Komt hij hier toch aan, dan is er iets
  // mis met de aanroeper — niet iets om stilzwijgend uit te voeren.
  if (action.local) {
    return NextResponse.json({ error: "deze keuze wordt niet op de server afgehandeld" }, { status: 400 });
  }

  const handler = HANDLERS[actionId];
  if (!handler) {
    return NextResponse.json(
      {
        error: `"${action.label}" wordt in een volgende fase gebouwd. De stap zelf staat er al.`,
        active_step: state.activeStepId,
      },
      { status: 501 },
    );
  }

  const result = await handler({ projectId, userId: viewer.id, snapshot, ledger, action, payload });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  if (result.decision) {
    const { error } = await recordStepDecision(
      projectId,
      result.decision.step,
      result.decision.data,
      result.decision.summary,
      viewer.id,
    );
    if (error) return NextResponse.json({ error }, { status: 400 });
  }
  if (result.note) {
    await appendTranscript(projectId, { role: "user", kind: "decision", step, text: result.note }, viewer.id);
  }

  // De volgende stap openen — met de verse toestand, want de handeling hierboven kan hem
  // net hebben verschoven.
  const nextSnapshot = await loadProjectSnapshot(projectId);
  const nextState = nextSnapshot
    ? deriveFlowState(nextSnapshot, await loadLedger(projectId))
    : state;
  await ensureOpening(projectId, nextState.activeStepId, viewer.id);

  return NextResponse.json({ ok: true, active_step: nextState.activeStepId });
}

export const POST = withJsonErrors(handlePost);
