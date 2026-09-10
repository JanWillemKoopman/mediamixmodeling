"use client";

// De schil: stappenbalk links, gesprek rechts, de kaart van de stap die je bekijkt onderaan
// het gesprek.
//
// Wat hier bewust NIET zit: gespreksverloop in React-state. Alles wat je ziet komt van de
// server (transcript + toestand), en een handeling gaat naar /api/flow en daarna terug via
// router.refresh(). Daardoor kan het beeld niet uit de pas lopen met de database — de fout
// waar de oude wizard vier losse vlaggen (busy, delegatedBusy, pendingProposal, phaseState)
// voor nodig had om er niet in te trappen.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { humanizeError } from "@/lib/humanizeMessage";
import { logAction, logError, loggedFetch } from "@/lib/log/client";
import { Composer } from "@/components/flow/Composer";
import { Conversation } from "@/components/flow/Conversation";
import { FlowRail } from "@/components/flow/FlowRail";
import { StepCard } from "@/components/flow/StepCard";
import { StepBody } from "@/components/flow/StepBody";
import type { FlowState } from "@/lib/flow/state";
import type { StepAction, StepId } from "@/lib/flow/steps";
import type { TranscriptEntry } from "@/lib/flow/transcript";
import type { Ledger } from "@/lib/flow/steps";
import type { BeliefProposal } from "@/components/flow/steps/BeliefsCard";
import { allows, type ProjectSnapshot } from "@/lib/types";

export function FlowShell({
  projectId,
  projectName,
  state,
  transcript,
  snapshot,
  ledger,
}: {
  projectId: string;
  projectName: string;
  state: FlowState;
  transcript: TranscriptEntry[];
  snapshot: ProjectSnapshot;
  ledger: Ledger;
}) {
  const router = useRouter();
  const [viewingStepId, setViewingStepId] = useState<StepId>(state.activeStepId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Wat de kaart van deze stap heeft ingevuld (de kolomindeling, de gemaakte keuzes). Gaat
  // mee met de eerstvolgende handeling, zodat beslissing en gevolg één aanroep zijn.
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  // Een lokale actie wordt niet naar de server gestuurd maar door de kaart zelf opgepakt.
  // De teller zorgt dat twee keer dezelfde klik ook twee keer aankomt.
  const [localSignal, setLocalSignal] = useState<{ actionId: string; n: number } | null>(null);
  // Het antwoord van de gids terwijl het binnenkomt. Alleen dit leeft kort in de client: zodra
  // de beurt klaar is staat hij in de database en komt hij via het transcript terug.
  const [streaming, setStreaming] = useState<string | null>(null);
  // Een voorstel van de gids voor stap 5 — de kaart vult zich er zichtbaar mee, de gebruiker
  // past aan en bevestigt zelf.
  const [proposal, setProposal] = useState<BeliefProposal | null>(null);

  // Schuift de actieve stap op (door een handeling, of doordat de worker klaar is), dan
  // schuift het beeld mee — tenzij de gebruiker zelf naar een eerdere stap is gegaan.
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!pinned) setViewingStepId(state.activeStepId);
  }, [state.activeStepId, pinned]);

  // De gids opent de stap waar je staat. Idempotent op de server: staat de tekst er al, dan
  // gebeurt er niets.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.opened) router.refresh();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, state.activeStepId, router]);

  // De worker werkt buiten deze pagina om door. Zonder dit zou een gebruiker naar een
  // spinner blijven kijken terwijl zijn berekening allang klaar is.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`flow-${projectId}`);
    for (const table of [
      "dataset_versions",
      "model_runs",
      "model_results",
      "data_inspections",
      "project_steps",
      "chat_messages",
    ] as const) {
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

  // De interpretatie bij de uitkomst wordt niet afgewacht tot iemand erom vraagt — dat was
  // precies de klacht: de cijfers stonden er, de betekenis zat achter een menuoptie. Eén poging
  // per berekening; mislukt hij (bijvoorbeeld omdat er getallen in stonden die niet herleidbaar
  // zijn, zie lib/ai/numberCheck.ts), dan blijven de door code gerenderde cijfers gewoon staan.
  const summaryTried = useRef<string | null>(null);
  useEffect(() => {
    const completed = snapshot.runs.find((r) => r.run.state === "completed");
    if (!completed?.result || completed.result.client_summary) return;
    if (!allows(completed.validation, "channel_contributions")) return;
    if (summaryTried.current === completed.run.id) return;
    summaryTried.current = completed.run.id;
    void fetch("/api/client-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, model_run_id: completed.run.id }),
    })
      .then((res) => {
        if (res.ok) router.refresh();
      })
      .catch(() => {});
  }, [snapshot.runs, projectId, router]);

  // Vangnet: een gemist Realtime-event mag geen eindeloos wachten worden.
  const anyWaiting = state.steps.some((s) => s.status === "waiting");
  useEffect(() => {
    if (!anyWaiting) return;
    const id = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(id);
  }, [anyWaiting, router]);

  const ask = useCallback(
    async (input: { message?: string; preset?: string }) => {
      setError(null);
      setBusy(true);
      setStreaming("");
      logAction("flow.vraag", { stap: viewingStepId, preset: input.preset ?? null, tekens: input.message?.length ?? 0 }, projectId);
      try {
        const res = await loggedFetch("/api/flow/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, step: viewingStepId, ...input }),
        });
        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => ({}));
          logError("flow.vraag.mislukt", json.error ?? `status ${res.status}`, { stap: viewingStepId, status: res.status }, projectId);
          setError(humanizeError(json.error, "De gids kon niet antwoorden.").text);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let event: { type: string; text?: string; reply?: string; error?: string; proposal?: unknown };
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }
            if (event.type === "delta" && event.text) {
              text += event.text;
              setStreaming(text);
            } else if (event.type === "done") {
              if (event.proposal) setProposal(event.proposal as BeliefProposal);
            } else if (event.type === "error") {
              logError("flow.vraag.stroomfout", event.error ?? "onbekend", { stap: viewingStepId }, projectId);
              setError(humanizeError(event.error, "De gids liep vast.").text);
            }
          }
        }
      } catch (err) {
        logError("flow.vraag.verbinding", err, { stap: viewingStepId }, projectId);
        setError("Er ging iets mis met de verbinding.");
      } finally {
        setBusy(false);
        setStreaming(null);
        // Vraag en antwoord staan nu in de database; het transcript haalt ze op.
        router.refresh();
      }
    },
    [projectId, router, viewingStepId],
  );

  const runAction = useCallback(
    async (action: StepAction) => {
      setError(null);
      // Elke handeling van de gebruiker komt hier langs — dit is dus de plek waar het
      // logboek leest als een verslag van wat hij deed, en niet als losse fouten.
      logAction("flow.actie", {
        actie: action.id,
        stap_in_beeld: viewingStepId,
        actieve_stap: state.activeStepId,
        ingevulde_velden: payload ? Object.keys(payload) : [],
      }, projectId);
      // Teruggaan verandert niets aan je gegevens; dat hoeft niet langs de server.
      if (action.goTo) {
        setViewingStepId(action.goTo);
        setPinned(action.goTo !== state.activeStepId);
        return;
      }
      // De drie knoppen die om de gids vragen, sturen een vaste vraag. Welke vraag staat in
      // lib/ai/guide.ts (PRESET_ASK), zodat de formulering op één plek leeft.
      if (action.id === "beliefs.suggest" || action.id === "launch.diagnose" || action.id === "results.explain") {
        void ask({ preset: action.id });
        return;
      }
      // Twee achtergrondtaken van minuten: de grondige data-inspectie en de uitgebreide
      // analyse. Ze lopen door als de gebruiker wegklikt, dus er wordt niet op gewacht — het
      // resultaat verschijnt via Realtime.
      const background: Record<string, { url: string; body: object; whenFailed: string }> = {
        "columns.inspect": {
          url: "/api/inspect",
          body: { project_id: projectId, scope: "raw" },
          whenFailed: "De inspectie kon niet starten.",
        },
        "results.analysis": {
          url: "/api/analysis",
          body: { project_id: projectId },
          whenFailed: "De analyse kon niet starten.",
        },
      };
      const task = background[action.id];
      if (task) {
        setBusy(true);
        try {
          const res = await loggedFetch(task.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(task.body),
          });
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            logError("flow.achtergrondtaak.mislukt", json.error ?? `status ${res.status}`, { actie: action.id, url: task.url, status: res.status }, projectId);
            setError(humanizeError(json.error, task.whenFailed).text);
          }
          router.refresh();
        } finally {
          setBusy(false);
        }
        return;
      }
      // De rest wordt in de kaart zelf afgehandeld: een bestand kiezen, een sjabloon
      // downloaden, terug naar de keuzes van deze stap.
      if (action.local) {
        setLocalSignal((prev) => ({ actionId: action.id, n: (prev?.n ?? 0) + 1 }));
        return;
      }
      setBusy(true);
      try {
        const res = await loggedFetch("/api/flow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, action_id: action.id, payload }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          logError("flow.actie.geweigerd", json.error ?? `status ${res.status}`, { actie: action.id, stap: viewingStepId, status: res.status }, projectId);
          setError(humanizeError(json.error, "Dat lukte niet — probeer het opnieuw.").text);
          router.refresh();
          return;
        }
        // Waar de handeling je bracht. Zonder deze regel is een geslaagde actie die je tóch
        // niet verder helpt onzichtbaar in het logboek: de server antwoordt 200, er is geen
        // fout om te melden, en het enige spoor is dat je even later nog eens klikt. Dat is
        // precies hoe de vastloper bij stap 2 eruitzag.
        logAction("flow.actie.resultaat", {
          actie: action.id,
          stap_ervoor: state.activeStepId,
          stap_erna: json.active_step ?? null,
          verschoven: json.active_step != null && json.active_step !== state.activeStepId,
        }, projectId);
        setPinned(false);
        router.refresh();
      } catch (err) {
        logError("flow.actie.verbinding", err, { actie: action.id, stap: viewingStepId }, projectId);
        setError("Er ging iets mis met de verbinding.");
      } finally {
        setBusy(false);
      }
    },
    [projectId, router, state.activeStepId, viewingStepId, payload, ask],
  );

  const viewing = state.steps.find((s) => s.id === viewingStepId) ?? state.steps[0];
  const lookingBack = viewingStepId !== state.activeStepId;

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 pb-6 pt-3 sm:px-6 lg:grid-cols-[17rem_1fr]">
      <aside className="lg:sticky lg:top-4 lg:h-fit">
        <div className="rounded-2xl border border-border bg-surface-2 p-4">
          <p className="mb-3 truncate text-sm font-semibold text-fg">{projectName}</p>
          <FlowRail
            steps={state.steps}
            viewingStepId={viewingStepId}
            onSelect={(id) => {
              setViewingStepId(id as StepId);
              setPinned(id !== state.activeStepId);
            }}
          />
        </div>
      </aside>

      <div className="flex min-h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface-1">
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6">
          <Conversation entries={transcript} />

          {lookingBack && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">
              <span>
                Je kijkt terug naar stap {viewing.number}. Je voortgang blijft gewoon staan.
              </span>
              <button
                type="button"
                onClick={() => {
                  setPinned(false);
                  setViewingStepId(state.activeStepId);
                }}
                className="flex flex-none items-center gap-1 rounded-md border border-border px-2 py-1 font-medium transition hover:bg-surface-3"
              >
                <Undo2 className="h-3 w-3" /> Terug naar nu
              </button>
            </div>
          )}

          {/* Het antwoord van de gids terwijl het binnenkomt. */}
          {streaming != null && (
            <div className="flex items-start gap-2">
              <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent-dim text-accent">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              </div>
              <div className="max-w-[85%] rounded-2xl border border-strong bg-surface px-4 py-2.5 text-sm text-fg">
                {streaming || "Denkt na…"}
              </div>
            </div>
          )}

          <div className="space-y-3 pt-1">
            <StepBody
              stepId={viewing.id}
              projectId={projectId}
              snapshot={snapshot}
              ledger={ledger}
              localSignal={localSignal}
              proposal={proposal}
              onPayloadChange={setPayload}
              onChanged={() => router.refresh()}
              onGoBack={(step) => {
                setViewingStepId(step);
                setPinned(step !== state.activeStepId);
              }}
            />
            <StepCard step={viewing} busy={busy} error={error} onAction={runAction} />
          </div>
        </div>

        {/* Vragen mogen altijd, in elke stap — ook tijdens het wachten op de worker. */}
        <Composer onAsk={(question) => void ask({ message: question })} busy={busy} />
      </div>
    </div>
  );
}
