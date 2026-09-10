"use client";

// De schil: stappenbalk links, gesprek rechts, de kaart van de stap die je bekijkt onderaan
// het gesprek.
//
// Wat hier bewust NIET zit: gespreksverloop in React-state. Alles wat je ziet komt van de
// server (transcript + toestand), en een handeling gaat naar /api/flow en daarna terug via
// router.refresh(). Daardoor kan het beeld niet uit de pas lopen met de database — de fout
// waar de oude wizard vier losse vlaggen (busy, delegatedBusy, pendingProposal, phaseState)
// voor nodig had om er niet in te trappen.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { humanizeError } from "@/lib/humanizeMessage";
import { Conversation } from "@/components/flow/Conversation";
import { FlowRail } from "@/components/flow/FlowRail";
import { StepCard } from "@/components/flow/StepCard";
import { StepBody } from "@/components/flow/StepBody";
import type { FlowState } from "@/lib/flow/state";
import type { StepAction, StepId } from "@/lib/flow/steps";
import type { TranscriptEntry } from "@/lib/flow/transcript";
import type { DatasetVersion, SourceFile } from "@/lib/types";

export function FlowShell({
  projectId,
  projectName,
  state,
  transcript,
  source,
  dataset,
}: {
  projectId: string;
  projectName: string;
  state: FlowState;
  transcript: TranscriptEntry[];
  source: SourceFile | null;
  dataset: DatasetVersion | null;
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

  // Vangnet: een gemist Realtime-event mag geen eindeloos wachten worden.
  const anyWaiting = state.steps.some((s) => s.status === "waiting");
  useEffect(() => {
    if (!anyWaiting) return;
    const id = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(id);
  }, [anyWaiting, router]);

  const runAction = useCallback(
    async (action: StepAction) => {
      setError(null);
      // Teruggaan verandert niets aan je gegevens; dat hoeft niet langs de server.
      if (action.goTo) {
        setViewingStepId(action.goTo);
        setPinned(action.goTo !== state.activeStepId);
        return;
      }
      // Een bestand kiezen of een sjabloon downloaden gebeurt in de kaart zelf.
      if (action.local) {
        setLocalSignal((prev) => ({ actionId: action.id, n: (prev?.n ?? 0) + 1 }));
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/flow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, action_id: action.id, payload }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(humanizeError(json.error, "Dat lukte niet — probeer het opnieuw.").text);
          router.refresh();
          return;
        }
        setPinned(false);
        router.refresh();
      } catch {
        setError("Er ging iets mis met de verbinding.");
      } finally {
        setBusy(false);
      }
    },
    [projectId, router, state.activeStepId, payload],
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

          <div className="space-y-3 pt-1">
            <StepBody
              stepId={viewing.id}
              projectId={projectId}
              source={source}
              dataset={dataset}
              localSignal={localSignal}
              onPayloadChange={setPayload}
              onChanged={() => router.refresh()}
            />
            <StepCard step={viewing} busy={busy} error={error} onAction={runAction} />
          </div>
        </div>
      </div>
    </div>
  );
}
