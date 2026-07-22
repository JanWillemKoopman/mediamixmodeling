"use client";

// De chat-spine (linkerkant). Dit is de MOTOR van de wizard: een deterministische
// toestandsmachine die de gebruiker stap voor stap door het hele MMM-proces loodst — nu
// volledig via tekst. Geen kaarten met knoppen/dropdowns/sliders meer: elke fase stelt zijn
// vraag in de chat (met een genummerd menu als er een keuze is) en de gebruiker typt het
// antwoord. De enige uitzondering is bestandsupload — ruwe CSV/XLSX-bytes kunnen niet als
// tekst — die krijgt een bijlage-affordance in de composer, net als in elke chat-app.
//
// Token-arm ontwerp, ongewijzigd t.o.v. de kaarten-versie:
//  - Elke fase-bubbel is vooraf geschreven (lib/wizard/script.ts) en kost 0 tokens.
//  - Genummerde menu's worden deterministisch geparst (lib/wizard/questions.ts) — 0 tokens.
//  - De architect (Claude) wordt alleen ingeschakeld als de gebruiker vrij typt, een
//    menukeuze dat expliciet vraagt (bv. "gebruik de aanbevolen instellingen"), of een
//    voorstel bevestigt. Een voorstel wordt met een getypt "ja" overgenomen (start dezelfde
//    prepare/fit-flow als voorheen de kaarten).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Bot, Undo2, Paperclip } from "lucide-react";
import { humanizeError } from "@/lib/humanizeMessage";
import { createClient } from "@/lib/supabase/client";
import { useWizardChat } from "@/components/WizardChatContext";
import { derivePhase, isWaitingPhase, type WizardPhase } from "@/lib/wizard/phase";
import { PHASE_SCRIPT, PHASE_STEPS } from "@/lib/wizard/script";
import { matchOption, YES_OPTION } from "@/lib/wizard/questions";
import { STANDARD_SAMPLE } from "@/lib/wizard/tuningDefaults";
import { uploadSourceFile } from "@/lib/wizard/turns/upload";
import * as inspectTurn from "@/lib/wizard/turns/inspect";
import { confirmMappingFromRecipe } from "@/lib/wizard/turns/inspect";
import * as prepareRecipeTurn from "@/lib/wizard/turns/prepareRecipe";
import * as prepareReviewTurn from "@/lib/wizard/turns/prepareReview";
import * as contextTurn from "@/lib/wizard/turns/context";
import * as tuningTurn from "@/lib/wizard/turns/tuning";
import * as fitFailedTurn from "@/lib/wizard/turns/fitFailed";
import * as reviewTurn from "@/lib/wizard/turns/review";
import type { TurnEnv, TurnReplyResult } from "@/lib/wizard/turns/types";
import { DatasetPreviewTable } from "@/components/DatasetPreviewTable";
import { SummaryView } from "@/components/SummaryView";
import { HierarchicalSummaryView } from "@/components/HierarchicalSummaryView";
import { AnalysisView } from "@/components/AnalysisView";
import { isHierSummary } from "@/lib/types";
import type { DataInspection, Dataset, Job, JobConfig, ModelRun, PrepareRecipe, SourceFile } from "@/lib/types";
import { Markdown } from "@/components/Markdown";

// Wat de architect op dit moment aan het doen is — puur voor de statusindicator, geen
// invloed op de inhoud. "thinking": redeneert (extended thinking); "tool": stelt een
// voorstel samen; "text": schrijft het zichtbare antwoord.
type AiPhase = "thinking" | "tool" | "text" | null;

const TOOL_LABEL: Record<string, string> = {
  propose_prepare_recipe: "een samenvoegrecept",
  propose_model_config: "een modelconfiguratie",
  record_business_context: "de zakelijke context",
};

const YES_OPTION_LABEL = `Typ "${YES_OPTION.label}"`;

interface Turn {
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  thinking?: string;
  phase?: AiPhase;
  toolName?: string;
}

interface PendingProposal {
  kind: "recipe" | "config";
  payload: unknown;
}

// Per fase: hoe de vaste intro-tekst (+ eventueel menu) wordt opgebouwd, en hoe een getypt
// antwoord wordt verwerkt. Ontbreekt een fase hier (upload/prepare_running/fitting), dan is
// er geen fase-specifieke intro/afhandeling — upload heeft de bijlage-affordance, de twee
// wacht-fasen hebben alleen de wacht-indicator.
const TURN_MODULES: Partial<
  Record<WizardPhase, { intro: (env: TurnEnv) => string; resolve: (env: TurnEnv, reply: string) => Promise<TurnReplyResult> }>
> = {
  inspect: inspectTurn,
  prepare_recipe: prepareRecipeTurn,
  prepare_failed: { intro: prepareRecipeTurn.introFailed, resolve: prepareRecipeTurn.resolve },
  prepare_review: prepareReviewTurn,
  context: contextTurn,
  tuning: tuningTurn,
  fit_failed: fitFailedTurn,
  review: reviewTurn,
  published: reviewTurn,
};

function matchBackCommand(text: string): { phase: WizardPhase; label: string } | "now" | null {
  const t = text.trim().toLowerCase();
  if (!/^terug\b/.test(t)) return null;
  if (/^terug(\s+naar)?\s*(nu)?$/.test(t)) return "now";
  for (const step of PHASE_STEPS) {
    if (!step.backTarget) continue;
    const label = step.label.replace(/^\d+\.\s*/, "").toLowerCase();
    if (t.includes(label)) return { phase: step.backTarget, label: step.label };
  }
  return null;
}

// Wachtindicator met verstreken-tijd én stall-detectie: bij een asynchrone stap (samenvoegen
// of berekenen) toont hij hoelang we al wachten, en na een drempel een escalatiebanner — zodat
// een vastgelopen worker niet als een eeuwig draaiende spinner zonder signaal verschijnt.
function WaitingIndicator({ phase, since }: { phase: WizardPhase; since: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const elapsedMin = since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000)) : 0;
  const thresholdMin = phase === "fitting" ? 12 : 3;
  const stalled = since != null && elapsedMin >= thresholdMin;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm text-fg-faint">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Bezig…
        {since && <span>· {elapsedMin === 0 ? "net gestart" : `${elapsedMin} min bezig`}</span>}
      </p>
      {stalled && (
        <div className="rounded-lg border border-warn/30 bg-warn-dim px-3 py-2 text-xs text-warn">
          Dit duurt langer dan verwacht —{" "}
          {phase === "fitting"
            ? "een berekening is meestal binnen ~5 minuten klaar."
            : "samenvoegen duurt normaal minder dan een minuut."}{" "}
          De rekenlaag pikt taken normaal vanzelf op. Ververs de pagina; blijft het hangen, controleer dan de
          worker-status of neem contact op.
        </div>
      )}
    </div>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  return (
    <div className={role === "user" ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[90%] rounded-2xl px-4 py-2.5 text-sm " +
          (role === "user" ? "whitespace-pre-wrap bg-user text-white" : "border border-strong bg-surface text-fg")
        }
      >
        {role === "assistant" ? <Markdown text={text} /> : text}
      </div>
    </div>
  );
}

export function ChatWizard({
  projectId,
  sources,
  dataset,
  jobs,
  runs,
  jobConfigs,
  kpiMargin,
  industry,
  companyDescription,
  contextProvided,
  latestInspection,
}: {
  projectId: string;
  sources: SourceFile[];
  dataset: Dataset | null;
  jobs: Job[];
  runs: ModelRun[];
  jobConfigs: Record<string, JobConfig>;
  kpiMargin: number | null;
  industry: string | null;
  companyDescription: string | null;
  contextProvided: boolean;
  latestInspection: DataInspection | null;
}) {
  const router = useRouter();
  const { pendingChatMessage, clearPendingChatMessage, overridePhase, overrideReason, clearOverridePhase, goToPhase, reuseJobConfig, setReuseJobConfig, clearReuseJobConfig } =
    useWizardChat();
  // "Overslaan" bij de zakelijke context bewaren we per project, zodat de stap niet na een
  // refresh of terugkomst opnieuw opduikt (client-side, geen serverwijziging nodig).
  const skipKey = `mmm:skipContext:${projectId}`;
  const [skipContext, setSkipContext] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(skipKey) === "1") setSkipContext(true);
    } catch {
      // localStorage niet beschikbaar — dan geldt alleen de sessie-state.
    }
  }, [skipKey]);
  const naturalPhase: WizardPhase = derivePhase({ sources, dataset, jobs, runs, contextProvided, skipContext });
  // Terugkoppeling/iteratie: een override toont een eerdere fase zonder de deterministische
  // afleiding zelf aan te passen (zie WizardChatContext.goToPhase).
  const phase: WizardPhase = overridePhase ?? naturalPhase;
  const source = sources[0] ?? null;
  const activeFitJob = jobs.find(
    (j) => (j.type === "fit" || j.type === "fit_hierarchical") && (j.status === "queued" || j.status === "running"),
  );
  const waitingSince =
    naturalPhase === "fitting"
      ? activeFitJob?.created_at ?? null
      : naturalPhase === "prepare_running"
        ? dataset?.created_at ?? null
        : null;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [phaseState, setPhaseState] = useState<unknown>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fase-lokale gesprekstoestand (bv. "we zijn een correctie aan het opschrijven") hoort bij
  // precies één fase — wissen zodra de fase wisselt, anders lekt 'm door naar de volgende.
  useEffect(() => {
    setPhaseState(null);
    setPendingProposal(null);
  }, [phase]);

  // Realtime: zodra de worker een dataset/job/run bijwerkt, ververst de server-render en
  // schuift de fase vanzelf door — zonder pollen.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`wizard-${projectId}`);
    for (const table of ["datasets", "jobs", "model_runs", "data_inspections"] as const) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "mmm", table, filter: `project_id=eq.${projectId}` },
        () => router.refresh(),
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, router]);

  // Vangnet: mocht een Realtime-event gemist worden, pollt de client zachtjes door zolang we
  // nog op de worker wachten.
  useEffect(() => {
    if (!isWaitingPhase(naturalPhase)) return;
    const id = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(id);
  }, [naturalPhase, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy, phase]);

  // Een paneel elders (bv. een kwaliteitspoort-waarschuwing) kan een kant-en-klare vraag
  // rechtstreeks naar de architect sturen via WizardChatContext.
  useEffect(() => {
    if (pendingChatMessage == null || busy) return;
    clearPendingChatMessage();
    void send(pendingChatMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChatMessage, busy]);

  const turnEnv: TurnEnv = {
    projectId,
    source,
    dataset,
    jobs,
    runs,
    jobConfigs,
    kpiMargin,
    latestInspection,
    phaseState,
    setPhaseState,
    reuseJobConfig,
    setReuseJobConfig,
    pushMessage: (text: string) => setTurns((prev) => [...prev, { role: "assistant", text }]),
    refresh: () => router.refresh(),
    skipBusinessContext: () => {
      try {
        localStorage.setItem(skipKey, "1");
      } catch {
        // Bewaren niet mogelijk — de sessie-state hieronder volstaat voor nu.
      }
      setSkipContext(true);
      clearOverridePhase();
    },
    goToPhase,
    askArchitect: (message: string) => askArchitectMessage(message),
  };

  // De architect-beurt zelf (streaming) — losstaand van de publieke send()-busy-check, want
  // dit wordt ook aangeroepen NADAT een menukeuze al binnen een lopende beurt zit (bv.
  // "gebruik de aanbevolen instellingen"). Beheert zijn eigen busy-status.
  async function runArchitectTurn(text: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, message: text }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(humanizeError(j.error, "Er ging iets mis — probeer het opnieuw.").text);
        return;
      }
      setTurns((prev) => [...prev, { role: "assistant", text: "", streaming: true }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const updateLast = (patch: Partial<Turn> | ((t: Turn) => Turn)) =>
        setTurns((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = typeof patch === "function" ? patch(last) : { ...last, ...patch };
          return next;
        });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: {
            type: string;
            text?: string;
            reply?: string;
            error?: string;
            proposedConfig?: unknown;
            proposedRecipe?: unknown;
            phase?: string;
            tool?: string;
          };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "phase") {
            updateLast((t) => ({ ...t, phase: (ev.phase as AiPhase) ?? null, toolName: ev.tool ?? t.toolName }));
          } else if (ev.type === "thinking_delta" && ev.text) {
            updateLast((t) => ({ ...t, thinking: (t.thinking ?? "") + ev.text, phase: "thinking" }));
          } else if (ev.type === "delta" && ev.text) {
            updateLast((t) => ({ ...t, text: t.text + ev.text, phase: "text" }));
          } else if (ev.type === "done") {
            const proposal: PendingProposal | null = ev.proposedRecipe
              ? { kind: "recipe", payload: ev.proposedRecipe }
              : ev.proposedConfig
                ? { kind: "config", payload: ev.proposedConfig }
                : null;
            setPendingProposal(proposal);
            const replyText = ev.reply || "Geen aanvullende toelichting.";
            const menu = proposal
              ? `\n\n${YES_OPTION_LABEL} om dit toe te passen, of beschrijf wat er anders moet.`
              : "";
            updateLast((t) => ({ ...t, text: replyText + menu, streaming: false, phase: null }));
          } else if (ev.type === "error") {
            setError(humanizeError(ev.error, "Er ging iets mis in het antwoord.").text);
            updateLast({ streaming: false, phase: null });
          }
        }
      }
      updateLast((t) => ({ ...t, streaming: false }));
    } catch {
      setError("Er ging iets mis met de verbinding.");
    } finally {
      setBusy(false);
    }
  }

  function askArchitectMessage(text: string) {
    setTurns((prev) => [...prev, { role: "user", text }]);
    void runArchitectTurn(text);
  }

  // Een AI-voorstel overnemen ("ja, toepassen"): dezelfde flow als de oude kaarten. Een
  // recept start de prepare-job; een config bevestigt eerst de tuning (net als de oude
  // "Start de berekening"-knop) en start daarna de fit.
  async function applyProposal(kind: "recipe" | "config", payload: unknown) {
    setBusy(true);
    setError(null);
    try {
      if (kind === "recipe") {
        const { reasoning: _r, ...rest } = payload as { reasoning?: string } & Record<string, unknown>;
        const recipe = rest as unknown as PrepareRecipe;
        const res = await fetch("/api/datasets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, recipe }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
        // Een toegepast recept legt de kolomrollen al net zo hard vast als handmatig
        // bevestigen (optie 1 in de inspect-fase) — zonder dit blijft de fase-afleiding voor
        // altijd "inspect" melden, ook al draait de samenvoeging allang (zie
        // lib/wizard/turns/inspect.ts: confirmMappingFromRecipe).
        if (source && !source.inspection_confirmed_at) {
          await confirmMappingFromRecipe(source, recipe);
        }
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            text:
              "Toegepast — ik voeg de data samen en controleer de kwaliteit. Dat duurt meestal minder dan een minuut; " +
              "ik laat het hier vanzelf weten zodra het klaar is, dan bekijken we samen het kwaliteitsrapport.",
          },
        ]);
      } else {
        const { reasoning: _r, ...rest } = payload as { reasoning?: string } & Record<string, unknown>;
        const model = (rest.model as Record<string, unknown> | undefined) ?? {};
        if (dataset) {
          const { kpi: _kpi, ...tuningDraft } = model;
          const confirmRes = await fetch(`/api/datasets/${dataset.id}/confirm-tuning`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tuning_draft: tuningDraft }),
          });
          if (!confirmRes.ok) throw new Error((await confirmRes.json().catch(() => ({}))).error);
        }
        const config = { ...rest, sample: reuseJobConfig?.sample ?? STANDARD_SAMPLE };
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, type: "fit", dataset_id: dataset?.id ?? null, config }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
        clearReuseJobConfig();
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            text:
              "Toegepast — de berekening start. Dit is een uitgebreide berekening en duurt meestal 3 tot 5 minuten; " +
              "ik laat het hier vanzelf weten zodra die klaar is, dan bespreken we samen het resultaat.",
          },
        ]);
      }
      router.refresh();
    } catch (e) {
      setError(humanizeError((e as Error).message, "Het voorstel overnemen is niet gelukt.").text);
    } finally {
      setBusy(false);
    }
  }

  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    if (!preset) setInput("");
    setError(null);
    setTurns((prev) => [...prev, { role: "user", text }]);
    setBusy(true);

    // 1. Reageert dit op een openstaand AI-voorstel? Alleen een duidelijke "ja" wordt
    // deterministisch overgenomen; al het andere loopt gewoon door als een nieuw bericht
    // (het voorstel blijft dan niet hangen — een vervolgvraag gaat gewoon naar de architect).
    if (pendingProposal) {
      const proposal = pendingProposal;
      setPendingProposal(null);
      if (matchOption(text, [YES_OPTION])) {
        await applyProposal(proposal.kind, proposal.payload);
        return;
      }
    }

    // 2. Globaal "terug naar <stap>"-commando.
    const back = matchBackCommand(text);
    if (back) {
      if (back === "now") {
        clearOverridePhase();
        setTurns((prev) => [...prev, { role: "assistant", text: "Oké, terug naar nu." }]);
      } else {
        goToPhase(back.phase, "je vroeg om terug te gaan");
        setTurns((prev) => [...prev, { role: "assistant", text: `Oké, terug naar ${back.label}.` }]);
      }
      setBusy(false);
      return;
    }

    // 3. Fase-lokale, deterministische afhandeling (0 tokens) — een herkende menukeuze of
    // een simpel "nee"/"overslaan".
    const turnModule = TURN_MODULES[phase];
    if (turnModule) {
      const result = await turnModule.resolve(turnEnv, text);
      if (result.handled) {
        if (result.reply) setTurns((prev) => [...prev, { role: "assistant", text: result.reply as string }]);
        if (result.refresh) router.refresh();
        if (!result.delegatedBusy) setBusy(false);
        return;
      }
    }

    // 4. Vrij typen → de architect (streaming).
    await runArchitectTurn(text);
  }

  async function handleUpload(files: FileList | File[]) {
    setUploadBusy(true);
    setError(null);
    const { error: uploadError } = await uploadSourceFile(projectId, files);
    setUploadBusy(false);
    if (uploadError) {
      setError(uploadError);
      return;
    }
    router.refresh();
  }

  const script = PHASE_SCRIPT[phase];
  const turnModule = TURN_MODULES[phase];
  const turnIntro = turnModule ? turnModule.intro(turnEnv) : "";
  const introText = turnIntro ? `${script.message}\n\n${turnIntro}` : script.message;

  const viewedRun = (phase === "review" || phase === "published") && runs.length > 0 ? reviewTurn.viewedRun(turnEnv) : null;
  const viewedIsHierarchical = viewedRun ? isHierSummary(viewedRun.summary) : false;
  const viewedLikelihood = viewedRun?.job_id ? jobConfigs[viewedRun.job_id]?.model.likelihood : undefined;
  const isCountKpi = viewedLikelihood === "poisson" || viewedLikelihood === "negative_binomial";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6">
        {/* Terugkoppeling/iteratie: de bouwer bekijkt/wijzigt hier een eerdere stap dan waar
            het project daadwerkelijk staat. Niets is gewist — pas als hieronder iets
            opnieuw wordt ingediend, verandert er echt iets. */}
        {overridePhase && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-strong bg-surface-2 px-3 py-2 text-xs text-fg">
            <span>
              Je bekijkt een eerdere stap ({PHASE_SCRIPT[overridePhase].dossierLabel})
              {overrideReason ? ` — ${overrideReason}` : ""}. Je voortgang blijft bewaard.
            </span>
            <button
              onClick={clearOverridePhase}
              className="flex flex-none items-center gap-1 rounded-md border border-current/30 px-2 py-1 font-medium transition hover:bg-surface-3"
            >
              <Undo2 className="h-3 w-3" /> Terug naar nu
            </button>
          </div>
        )}

        {/* De vaste fase-bubbel + eventueel passieve (niet-interactieve) weergave. */}
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent-dim text-accent">
            <Bot className="h-4 w-4" />
          </div>
          <div className="flex-1 space-y-3">
            <Bubble role="assistant" text={introText} />
            {phase === "prepare_review" && dataset?.preview && <DatasetPreviewTable preview={dataset.preview} />}
            {viewedRun &&
              (viewedIsHierarchical ? (
                <HierarchicalSummaryView summary={viewedRun.summary as unknown as Parameters<typeof HierarchicalSummaryView>[0]["summary"]} />
              ) : (
                <SummaryView summary={viewedRun.summary} kpiMargin={kpiMargin} isCountKpi={isCountKpi} />
              ))}
            {viewedRun && !viewedIsHierarchical && viewedRun.analysis && <AnalysisView analysis={viewedRun.analysis} />}
            {isWaitingPhase(phase) && <WaitingIndicator phase={phase} since={waitingSince} />}
          </div>
        </div>

        {/* Vrij-tekst-gesprek met de architect. */}
        {turns.map((t, i) => (
          <div key={i}>
            {t.role === "assistant" && t.streaming && (
              <p className="mb-1 flex items-center gap-1.5 pl-1 text-xs text-fg-faint">
                <span className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-accent" />
                {t.phase === "thinking"
                  ? "Denkt na…"
                  : t.phase === "tool"
                    ? `Stelt ${TOOL_LABEL[t.toolName ?? ""] ?? "een voorstel"} samen…`
                    : t.text
                      ? "Schrijft antwoord…"
                      : "Denkt na…"}
              </p>
            )}
            {t.thinking && (
              <details
                className="mb-1 max-w-[90%] rounded-lg border border-border/60 bg-surface-2/40 px-3 py-1.5 text-xs text-fg-faint"
                open={Boolean(t.streaming && t.phase === "thinking")}
              >
                <summary className="cursor-pointer select-none">Redenering</summary>
                <p className="mt-1 whitespace-pre-wrap">{t.thinking}</p>
              </details>
            )}
            <Bubble role={t.role} text={t.text || (t.streaming ? "…" : "")} />
          </div>
        ))}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {/* Composer: vrije tekst + (alleen tijdens upload) de bijlage-affordance — het enige
          niet-tekst-element in de hele wizard, omdat ruwe bestandsbytes geen chattekst zijn. */}
      <div className="border-t border-border p-3">
        {phase === "upload" && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length > 0) void handleUpload(e.dataTransfer.files);
            }}
            className={`mb-2 flex flex-wrap items-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 text-xs transition ${
              dragOver ? "border-accent/50 bg-accent-dim text-fg" : "border-border text-fg-faint"
            }`}
          >
            <Paperclip className="h-3.5 w-3.5 flex-none" />
            <span>Sleep je CSV hierheen, of</span>
            <label className="cursor-pointer font-medium text-accent hover:underline">
              kies een bestand
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                disabled={uploadBusy}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void handleUpload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {uploadBusy && <span>Uploaden…</span>}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Typ je antwoord…"
            className="flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none transition focus:border-strong"
          />
          <button onClick={() => send()} disabled={!input.trim() || busy} className="rounded-lg bg-accent p-2 text-bg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-fg-faint" aria-label="Versturen">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
