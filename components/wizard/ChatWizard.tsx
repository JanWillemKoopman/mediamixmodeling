"use client";

// De chat-spine (linkerkant). Dit is de MOTOR van de wizard: een deterministische
// toestandsmachine die de gebruiker stap voor stap door het hele MMM-proces loodst.
//
// Token-arm ontwerp:
//  - Elke fase-bubbel + elke kaart is vooraf geschreven en kost 0 tokens.
//  - Kolomrollen komen uit de goedkope classificatie die al bij upload draaide.
//  - Het standaard-modelpad is volledig deterministisch.
//  - De architect (Claude) wordt alleen ingeschakeld als de gebruiker vrij typt of
//    expliciet "Laat de AI optimaliseren" kiest. Een voorstel dat terugkomt kan met één
//    klik worden overgenomen (start dezelfde prepare/fit-flow als de kaarten).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Send, Bot, Undo2 } from "lucide-react";
import { humanizeError } from "@/lib/humanizeMessage";
import { createClient } from "@/lib/supabase/client";
import { useWizardChat } from "@/components/WizardChatContext";
import { derivePhase, isWaitingPhase, type WizardPhase } from "@/lib/wizard/phase";
import { PHASE_SCRIPT } from "@/lib/wizard/script";
import {
  UploadCard,
  InspectCard,
  PrepareCard,
  PrepareReviewCard,
  ContextCard,
  TuningCard,
  ModelSpecCard,
  ReviewCard,
  FitRefineButton,
} from "@/components/wizard/cards";
import type { Dataset, Job, JobConfig, ModelRun, SourceFile } from "@/lib/types";
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

interface Turn {
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  proposedRecipe?: unknown;
  proposedConfig?: unknown;
  // De gestreamde redenering (extended thinking) — apart van het zichtbare antwoord,
  // zodat de bouwer kan zien DAT en WAARMEE de architect bezig is.
  thinking?: string;
  phase?: AiPhase;
  toolName?: string;
}

// Assistent-antwoorden komen als markdown terug (kopjes/bullets/**vet**, zie de
// system-prompts in lib/anthropic/) — die renderen we dus ook als markdown in plaats van
// als platte, pre-wrapped tekst. De gebruiker typt zelf geen markdown, dus die bubbel
// blijft platte tekst met behouden regeleinden.
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
}) {
  const router = useRouter();
  const { pendingChatMessage, clearPendingChatMessage, overridePhase, overrideReason, clearOverridePhase } =
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
  // Terugkoppeling/iteratie (blueprint stap 7): een override toont een eerdere fase zonder
  // de deterministische afleiding zelf aan te passen — zie WizardChatContext.goToPhase.
  // Elke kaart die hierdoor opnieuw wordt getoond ruimt de override zelf op zodra de
  // bouwer 'm daadwerkelijk opnieuw indient (onDone), zodat de flow dan vanzelf weer de
  // actuele/nieuwe toestand toont (bijv. een nieuwe fit i.p.v. terug naar "review").
  const phase: WizardPhase = overridePhase ?? naturalPhase;
  const source = sources[0] ?? null;
  const latestFailedFit = jobs.find((j) => (j.type === "fit" || j.type === "fit_hierarchical") && j.status === "failed");
  const activeFitJob = jobs.find(
    (j) => (j.type === "fit" || j.type === "fit_hierarchical") && (j.status === "queued" || j.status === "running"),
  );
  // Startmoment van de lopende async-stap, voor de verstreken-tijd/stall-melding.
  const waitingSince =
    naturalPhase === "fitting"
      ? activeFitJob?.created_at ?? null
      : naturalPhase === "prepare_running"
        ? dataset?.created_at ?? null
        : null;
  const latestPriorPredictive =
    jobs.filter((j) => j.type === "prior_predictive").sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ??
    null;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Realtime: zodra de worker een dataset/job/run bijwerkt, ververst de server-render en
  // schuift de fase vanzelf door — zonder pollen. Eén subscriptie op de drie tabellen die
  // de async voortgang dragen (datasets: samenvoegen; jobs: fase-overgangen; model_runs:
  // resultaat verschijnt). Geen tokens, alleen een server-refresh.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`wizard-${projectId}`);
    for (const table of ["datasets", "jobs", "model_runs"] as const) {
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

  // Vangnet: mocht een Realtime-event gemist worden (verbinding weggevallen), pollt de
  // client zachtjes door zolang we nog op de worker wachten — traag, want Realtime is de
  // hoofdroute. Gebaseerd op de ECHTE fase, niet op een eventuele terug-navigatie-override:
  // een lopende fit blijft op de achtergrond doorlopen, ook als de bouwer intussen een
  // eerdere stap bekijkt.
  useEffect(() => {
    if (!isWaitingPhase(naturalPhase)) return;
    const id = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(id);
  }, [naturalPhase, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy, phase]);

  // Een kaart elders (bv. een kwaliteitspoort-waarschuwing of "waarom is dit niet goed
  // genoeg?" in SummaryView) kan een kant-en-klare vraag rechtstreeks naar de architect
  // sturen via WizardChatContext — wacht op een eventuele lopende beurt in plaats van hem
  // te laten vallen.
  useEffect(() => {
    if (pendingChatMessage == null || busy) return;
    clearPendingChatMessage();
    void send(pendingChatMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChatMessage, busy]);

  // Vrij typen → de architect (streaming). Dit is de enige plek in de happy path waar
  // tokens verbruikt worden buiten de twee expliciete AI-momenten.
  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    if (!preset) setInput("");
    setError(null);
    setTurns((prev) => [...prev, { role: "user", text }]);
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
        setBusy(false);
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
            // Statusovergang (denken → schrijven/voorstel) — puur informatief, geen tokens.
            updateLast((t) => ({ ...t, phase: (ev.phase as AiPhase) ?? null, toolName: ev.tool ?? t.toolName }));
          } else if (ev.type === "thinking_delta" && ev.text) {
            updateLast((t) => ({ ...t, thinking: (t.thinking ?? "") + ev.text, phase: "thinking" }));
          } else if (ev.type === "delta" && ev.text) {
            updateLast((t) => ({ ...t, text: t.text + ev.text, phase: "text" }));
          } else if (ev.type === "done") {
            updateLast((t) => ({
              ...t,
              text: ev.reply || t.text || "Geen aanvullende toelichting.",
              streaming: false,
              phase: null,
              proposedRecipe: ev.proposedRecipe ?? undefined,
              proposedConfig: ev.proposedConfig ?? undefined,
            }));
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

  // Een AI-voorstel overnemen: dezelfde flow als de kaarten, zodat de gebruiker in de vaste
  // pijplijn blijft. Een recept start de prepare-job; een config start de fit.
  async function applyProposal(kind: "recipe" | "config", payload: unknown) {
    setBusy(true);
    setError(null);
    try {
      if (kind === "recipe") {
        const { reasoning: _r, ...recipe } = payload as { reasoning?: string } & Record<string, unknown>;
        const res = await fetch("/api/datasets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, recipe }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      } else {
        const { reasoning: _r, ...rest } = payload as { reasoning?: string } & Record<string, unknown>;
        const config = { ...rest, sample: { draws: 1000, tune: 1000, chains: 4 } };
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, type: "fit", dataset_id: dataset?.id ?? null, config }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      }
      router.refresh();
    } catch (e) {
      setError(humanizeError((e as Error).message, "Het voorstel overnemen is niet gelukt.").text);
      setBusy(false);
    }
  }

  function askAiToOptimize() {
    inputRef.current?.focus();
    void send(
      "Kijk naar de goedgekeurde dataset en de zakelijke context en stel een geoptimaliseerde " +
        "modelconfiguratie voor (kanaaltypes, adstock/saturatie, trend/seizoen, likelihood).",
    );
  }

  const script = PHASE_SCRIPT[phase];

  // De kaart die bij de huidige fase hoort. Fasen die als "terug"-doel kunnen worden
  // geopend (zie PHASE_STEPS.backTarget) krijgen onDone={clearOverridePhase} mee, zodat
  // een daadwerkelijke nieuwe indiening de override opruimt en de flow weer de
  // actuele/nieuwe toestand toont.
  function renderCard() {
    switch (phase) {
      case "upload":
        return <UploadCard projectId={projectId} source={source} />;
      case "inspect":
        return source ? <InspectCard projectId={projectId} source={source} onDone={clearOverridePhase} /> : null;
      case "prepare_recipe":
        return source ? <PrepareCard projectId={projectId} source={source} onDone={clearOverridePhase} /> : null;
      case "prepare_failed":
        return (
          <div className="rounded-xl border border-danger/40 bg-danger-dim p-4">
            <p className="text-sm text-fg">{dataset?.error ?? "Onbekende fout bij het samenvoegen."}</p>
            {source && (
              <div className="mt-3">
                <PrepareCard projectId={projectId} source={source} onDone={clearOverridePhase} />
              </div>
            )}
          </div>
        );
      case "prepare_review":
        return dataset ? <PrepareReviewCard dataset={dataset} /> : null;
      case "context":
        return (
          <ContextCard
            projectId={projectId}
            industry={industry}
            description={companyDescription}
            kpiMargin={kpiMargin}
            onSkip={() => {
              try {
                localStorage.setItem(skipKey, "1");
              } catch {
                // Bewaren niet mogelijk — de sessie-state hieronder volstaat voor nu.
              }
              setSkipContext(true);
              clearOverridePhase();
            }}
            onDone={clearOverridePhase}
          />
        );
      case "tuning":
        return dataset ? (
          <TuningCard
            projectId={projectId}
            dataset={dataset}
            latestPriorPredictive={latestPriorPredictive}
            onAskAi={askAiToOptimize}
            onDone={clearOverridePhase}
          />
        ) : null;
      case "modelspec":
        return dataset ? <ModelSpecCard projectId={projectId} dataset={dataset} onDone={clearOverridePhase} /> : null;
      case "fit_failed":
        return (
          <div className="rounded-xl border border-danger/40 bg-danger-dim p-4">
            <p className="text-sm text-fg">{latestFailedFit?.error ?? "Onbekende fout bij de berekening."}</p>
            <div className="mt-3">
              <FitRefineButton projectId={projectId} />
            </div>
            {dataset && (
              <div className="mt-3">
                <ModelSpecCard projectId={projectId} dataset={dataset} onDone={clearOverridePhase} />
              </div>
            )}
          </div>
        );
      case "review":
      case "published":
        return runs.length > 0 ? <ReviewCard projectId={projectId} runs={runs} jobConfigs={jobConfigs} kpiMargin={kpiMargin} /> : null;
      default:
        return null; // prepare_running / fitting: alleen de wacht-bubbel + spinner
    }
  }

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

        {/* De vaste fase-bubbel + kaart. */}
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent-dim text-accent">
            <Bot className="h-4 w-4" />
          </div>
          <div className="flex-1 space-y-3">
            <Bubble role="assistant" text={script.message} />
            {renderCard()}
            {isWaitingPhase(phase) && <WaitingIndicator phase={phase} since={waitingSince} />}
          </div>
        </div>

        {/* Vrij-tekst-gesprek met de architect (escape hatch). */}
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
            {t.proposedRecipe != null && (
              <button onClick={() => applyProposal("recipe", t.proposedRecipe)} disabled={busy} className="mt-1 inline-flex items-center gap-1 rounded-lg border border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-surface-3 disabled:opacity-50">
                <Sparkles className="h-3 w-3" /> Voorstel overnemen & samenvoegen
              </button>
            )}
            {t.proposedConfig != null && (
              <button onClick={() => applyProposal("config", t.proposedConfig)} disabled={busy} className="mt-1 inline-flex items-center gap-1 rounded-lg border border-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-surface-3 disabled:opacity-50">
                <Sparkles className="h-3 w-3" /> Voorstel overnemen & berekenen
              </button>
            )}
          </div>
        ))}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {/* Vrij-tekst invoer — spaarzaam te gebruiken escape naast de vaste chips/kaarten. */}
      <div className="border-t border-border p-3">
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
            placeholder="Iets vragen aan de AI (optioneel — de knoppen hierboven loodsen je vanzelf verder)"
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
