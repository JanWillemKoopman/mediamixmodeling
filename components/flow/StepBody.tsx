"use client";

// Welke inhoud hoort bij welke stap.
//
// De acties (de knoppen) komen overal uit dezelfde plek: de stapdefinitie. Wat hier per stap
// verschilt is het wérk zelf — een bestand kiezen, kolommen aanwijzen, keuzes maken over
// opvallende weken, vertellen wat je al weet. Een stap zonder eigen inhoud rendert niets en
// houdt gewoon zijn knoppen.

import { UploadCard } from "@/components/flow/steps/UploadCard";
import { ColumnsCard } from "@/components/flow/steps/ColumnsCard";
import { QualityCard } from "@/components/flow/steps/QualityCard";
import { BeliefsCard, type BeliefProposal } from "@/components/flow/steps/BeliefsCard";
import { LaunchCard } from "@/components/flow/steps/LaunchCard";
import { ResultCard } from "@/components/flow/steps/ResultCard";
import { ShareCard } from "@/components/flow/steps/ShareCard";
import type { BeliefAnswers } from "@/lib/flow/beliefs";
import type { Ledger, StepId } from "@/lib/flow/steps";
import { isRunning, type KpiType, type ProjectSnapshot } from "@/lib/types";

export function StepBody({
  stepId,
  projectId,
  snapshot,
  ledger,
  localSignal,
  proposal,
  onPayloadChange,
  onChanged,
  onGoBack,
  onAsk,
  busy,
}: {
  stepId: StepId;
  projectId: string;
  snapshot: ProjectSnapshot;
  ledger: Ledger;
  localSignal: { actionId: string; n: number } | null;
  /** Een voorstel van de gids voor stap 5 — zichtbaar ingevuld, nooit stil toegepast. */
  proposal: BeliefProposal | null;
  onPayloadChange: (payload: Record<string, unknown> | null) => void;
  onChanged: () => void;
  /** Terug naar een eerdere stap — de uitkomstkaart biedt dat aan als het model tekortkomt. */
  onGoBack: (step: StepId) => void;
  /**
   * Een vraag aan de gids, gesteld vanuit de kaart zelf.
   *
   * Stap 4 gebruikt dit: bij een opvallende week is "wat is hier aan de hand?" precies de
   * vraag die een gebruiker heeft, en die hoort niet eerst overgetypt te hoeven worden in
   * het invoerveld onderaan.
   */
  onAsk: (question: string) => void;
  busy: boolean;
}) {
  const source = snapshot.sources[0] ?? null;

  if (stepId === "data") {
    return (
      <UploadCard
        projectId={projectId}
        source={source}
        localSignal={localSignal}
        onChanged={onChanged}
      />
    );
  }

  if (stepId === "columns" && source) {
    return <ColumnsCard source={source} onPayloadChange={onPayloadChange} />;
  }

  if (stepId === "prepare" && source) {
    return (
      <QualityCard
        source={source}
        dataset={snapshot.dataset}
        localSignal={localSignal}
        onPayloadChange={onPayloadChange}
        onAsk={onAsk}
        onChanged={onChanged}
        busy={busy}
      />
    );
  }

  if (stepId === "beliefs" && snapshot.approvedDataset) {
    return (
      <BeliefsCard
        dataset={snapshot.approvedDataset}
        proposal={proposal}
        onPayloadChange={onPayloadChange}
      />
    );
  }

  if (stepId === "launch") {
    // Het KPI-type komt uit stap 1 en de antwoorden uit stap 5 — allebei uit het grootboek,
    // zodat het overzicht toont wat er werkelijk is vastgelegd en niet wat er in de browser
    // nog open stond.
    const kpiType = (ledger.goal?.decision.kpi_type as KpiType | undefined) ?? "revenue";
    const answers = (ledger.beliefs?.decision.answers as BeliefAnswers | undefined) ?? null;
    const latest = snapshot.runs[0] ?? null;
    return (
      <LaunchCard
        dataset={snapshot.approvedDataset}
        kpiType={kpiType}
        answers={answers}
        runningRun={snapshot.runs.find((r) => isRunning(r.run)) ?? null}
        failedRun={
          latest && (latest.run.state === "failed" || latest.run.state === "cancelled") ? latest : null
        }
      />
    );
  }

  if (stepId === "results" || stepId === "share") {
    const completed = snapshot.runs.find((r) => r.run.state === "completed") ?? null;
    const margin = snapshot.project.kpi_margin ?? null;
    return stepId === "results" ? (
      <ResultCard run={completed} kpiMargin={margin} onGoBack={onGoBack} />
    ) : (
      <ShareCard projectId={projectId} run={completed} localSignal={localSignal} />
    );
  }

  return null;
}
