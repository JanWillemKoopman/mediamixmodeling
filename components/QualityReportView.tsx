"use client";

import { useWizardChatOptional } from "@/components/WizardChatContext";
import type { DatasetQuality, QualityIssue } from "@/lib/types";
import { humanizeQualityMessage } from "@/lib/humanizeMessage";
import { issueInfo } from "@/lib/qualityIssueRegistry";

// Renders an ingestion QualityReport as actionable items, not a wall of sentences:
// errors/warnings get the rose accent plus — via the issue registry — a "waarom boeit
// dit"-uitleg and where possible a targeted chat action, so the user never has to guess
// what to do with a finding. Unknown codes fall back to the bare (humanized) message.
export function QualityReportView({ quality }: { quality: DatasetQuality | null }) {
  const chat = useWizardChatOptional();
  const issues = quality?.issues ?? [];
  if (issues.length === 0) {
    return <p className="text-sm text-fg-muted">Geen bijzonderheden gevonden.</p>;
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  function IssueItem({ issue, tone }: { issue: QualityIssue; tone: "error" | "warning" }) {
    const info = issueInfo(issue.code);
    return (
      <li className="space-y-0.5">
        <p className={tone === "error" ? "text-sm text-danger" : "text-sm text-fg-muted"}>
          • {humanizeQualityMessage(issue.message)}
        </p>
        {info && (
          <div className="pl-3 text-xs text-fg-faint">
            <span>{info.explain}</span>{" "}
            {info.action &&
              (info.chatPrompt && chat ? (
                <button
                  onClick={() => chat.sendToChat(info.chatPrompt as string)}
                  className="font-medium text-accent hover:underline"
                >
                  {info.action} →
                </button>
              ) : (
                <span className="text-fg-muted">{info.action}</span>
              ))}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-3">
      {errors.length > 0 && (
        <div>
          <p className="text-sm font-medium text-danger">
            {errors.length} {errors.length === 1 ? "fout" : "fouten"} — dit blokkeert samenvoegen:
          </p>
          <ul className="mt-1 space-y-1.5">
            {errors.map((issue, i) => (
              <IssueItem key={i} issue={issue} tone="error" />
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div>
          <p className="text-sm font-medium text-fg">
            {warnings.length} {warnings.length === 1 ? "waarschuwing" : "waarschuwingen"} — de moeite van het bekijken waard:
          </p>
          <ul className="mt-1 space-y-1.5">
            {warnings.map((issue, i) => (
              <IssueItem key={i} issue={issue} tone="warning" />
            ))}
          </ul>
        </div>
      )}
      {infos.length > 0 && (
        <details className="text-sm text-fg-muted">
          <summary className="cursor-pointer select-none">
            {infos.length} info-melding{infos.length === 1 ? "" : "en"}
          </summary>
          <ul className="mt-1 space-y-1 pl-3">
            {infos.map((issue, i) => (
              <li key={i}>• {humanizeQualityMessage(issue.message)}</li>
            ))}
          </ul>
        </details>
      )}
      {chat && (errors.length > 0 || warnings.length > 0) && (
        <button
          onClick={() =>
            chat.sendToChat(
              "Loop het laatste kwaliteitsrapport met me door: wat betekenen de fouten/waarschuwingen concreet, welke moet ik echt oplossen, en stel waar nodig een gecorrigeerd recept voor.",
            )
          }
          className="rounded-lg border border-accent/30 bg-accent-dim px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
        >
          Bespreek dit rapport met de AI
        </button>
      )}
    </div>
  );
}
