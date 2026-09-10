"use client";

// Stap 4 — data klaarmaken.
//
// Twee gezichten, afhankelijk van waar de dataset staat:
//   * nog niets gebouwd → de opvallende dingen uit het profiel, elk als vraag met keuzes;
//   * gebouwd → het kwaliteitsrapport en een voorbeeld van de weektabel.
//
// De keuzes zijn geen instellingen. "Speelde daar iets bijzonders?" is een vraag die een
// marketeer kan beantwoorden; "event_dummy op ISO-week 48" is dat niet. De vertaling van de
// een naar de ander gebeurt in lib/flow/recipe.ts, en alleen naar iets wat de rekenkern ook
// echt kent.

import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { DatasetPreviewTable } from "@/components/DatasetPreviewTable";
import { humanizeQualityMessage } from "@/lib/humanizeMessage";
import { issueInfo } from "@/lib/qualityIssueRegistry";
import { analyseProfile } from "@/lib/flow/dataCheck";
import type { DatasetVersion, QualityIssue, SourceFile } from "@/lib/types";

function QualityReport({ dataset }: { dataset: DatasetVersion }) {
  const issues = dataset.suitability?.issues ?? [];
  const bySeverity = (severity: QualityIssue["severity"]) => issues.filter((i) => i.severity === severity);
  const errors = bySeverity("error");
  const warnings = bySeverity("warning");
  const infos = bySeverity("info");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="text-sm font-medium text-fg">
          {dataset.n_weeks ?? "?"} weken klaargezet
          {dataset.window_start && ` · ${dataset.window_start} t/m ${dataset.window_end}`}
        </p>
        {issues.length === 0 ? (
          <p className="mt-1.5 text-xs text-fg-muted">Geen bijzonderheden gevonden.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {[...errors, ...warnings].map((issue, i) => {
              const info = issueInfo(issue.code);
              return (
                <li key={i} className="text-xs">
                  <span className={issue.severity === "error" ? "text-danger" : "text-warn"}>
                    {humanizeQualityMessage(issue.message)}
                  </span>
                  {info && <span className="text-fg-faint"> — {info.explain}</span>}
                </li>
              );
            })}
            {infos.length > 0 && (
              <li className="text-xs text-fg-faint">
                {infos.length} kleinere melding{infos.length === 1 ? "" : "en"}:{" "}
                {infos.map((i) => humanizeQualityMessage(i.message)).join("; ")}.
              </li>
            )}
          </ul>
        )}
      </div>
      {dataset.preview && <DatasetPreviewTable preview={dataset.preview} />}
    </div>
  );
}

export function QualityCard({
  source,
  dataset,
  localSignal,
  onPayloadChange,
}: {
  source: SourceFile;
  dataset: DatasetVersion | null;
  localSignal: { actionId: string; n: number } | null;
  onPayloadChange: (payload: { choices: Record<string, string> } | null) => void;
}) {
  const { findings, notes } = useMemo(
    () => analyseProfile(source.profile, source.mapping),
    [source],
  );
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(findings.map((f) => [f.id, f.defaultChoice])),
  );
  // "Ik wil iets aanpassen" bij een gebouwde dataset brengt de keuzes terug in beeld. Er
  // wordt niets weggegooid: opnieuw indienen maakt gewoon een nieuwe datasetversie.
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (localSignal?.actionId === "prepare.adjust") setEditing(true);
  }, [localSignal]);

  useEffect(() => {
    onPayloadChange({ choices });
  }, [choices, onPayloadChange]);

  const showChoices = dataset == null || dataset.status === "failed" || editing;

  return (
    <div className="space-y-3">
      {dataset && dataset.status === "failed" && (
        <p className="rounded-lg border border-danger/30 bg-danger-dim px-3 py-2 text-sm text-danger">
          {dataset.error_message ?? "Het klaarmaken is niet gelukt."}
        </p>
      )}

      {dataset && dataset.status === "ready" && !editing && <QualityReport dataset={dataset} />}

      {showChoices && (
        <>
          {notes.length > 0 && (
            <ul className="space-y-1.5 rounded-xl border border-border bg-surface-2 p-3">
              {notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-fg-muted">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-none text-fg-faint" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}

          {findings.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Ik zie niets bijzonders in je data. Ik kan hem zo klaarmaken.
            </p>
          ) : (
            <div className="space-y-3">
              {findings.map((finding) => (
                <div key={finding.id} className="rounded-xl border border-border bg-surface-2 p-3.5">
                  <p className="text-sm font-medium text-fg">{finding.headline}</p>
                  <p className="mt-1 text-xs text-fg-muted">{finding.detail}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {finding.choices.map((choice) => (
                      <button
                        key={choice.id}
                        type="button"
                        title={choice.effect}
                        onClick={() => setChoices((prev) => ({ ...prev, [finding.id]: choice.id }))}
                        className={`rounded-full px-3 py-1.5 text-xs transition ${
                          choices[finding.id] === choice.id
                            ? "bg-accent text-bg"
                            : "border border-border text-fg-muted hover:bg-surface-3"
                        }`}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                  {/* Wat de gekozen optie doet — zodat een keuze nooit een gok is. */}
                  <p className="mt-2 text-[11px] text-fg-faint">
                    {finding.choices.find((c) => c.id === choices[finding.id])?.effect}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
