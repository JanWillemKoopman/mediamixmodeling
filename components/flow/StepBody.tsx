"use client";

// Welke inhoud hoort bij welke stap.
//
// De acties (de knoppen) komen overal uit dezelfde plek: de stapdefinitie. Wat hier per stap
// verschilt is het wérk zelf — een bestand kiezen, kolommen aanwijzen, keuzes maken over
// opvallende weken. Een stap zonder eigen inhoud rendert niets en houdt gewoon zijn knoppen.

import { UploadCard } from "@/components/flow/steps/UploadCard";
import { ColumnsCard } from "@/components/flow/steps/ColumnsCard";
import { QualityCard } from "@/components/flow/steps/QualityCard";
import type { StepId } from "@/lib/flow/steps";
import type { DatasetVersion, SourceFile } from "@/lib/types";

export function StepBody({
  stepId,
  projectId,
  source,
  dataset,
  localSignal,
  onPayloadChange,
  onChanged,
}: {
  stepId: StepId;
  projectId: string;
  source: SourceFile | null;
  dataset: DatasetVersion | null;
  localSignal: { actionId: string; n: number } | null;
  onPayloadChange: (payload: Record<string, unknown> | null) => void;
  onChanged: () => void;
}) {
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
        dataset={dataset}
        localSignal={localSignal}
        onPayloadChange={onPayloadChange}
      />
    );
  }

  return null;
}
