"use client";

// Stap 7 — wat zegt het model.
//
// Vier lagen, in deze volgorde: kun je hierop sturen → wat is er gebeurd → wat zou ik doen →
// de cijfers en de techniek (ingeklapt). Zie lib/flow/outcome.ts voor het waarom van die
// volgorde en voor de poort die elke laag afdekt.
//
// De getallen komen uit code, niet uit de gids. Een verzonnen percentage in een verder
// kloppende zin is niet te onderscheiden van een juist percentage.

import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { SummaryView } from "@/components/SummaryView";
import {
  adviceFor,
  headlineFigures,
  inseparableNote,
  steerVerdict,
} from "@/lib/flow/outcome";
import type { StepId } from "@/lib/flow/steps";
import type { RunView } from "@/lib/types";

const TONE = {
  good: { box: "border-success/30 bg-success-dim", icon: <CheckCircle2 className="h-4 w-4 text-success" /> },
  partial: { box: "border-warn/30 bg-warn-dim", icon: <Info className="h-4 w-4 text-warn" /> },
  blocked: { box: "border-danger/30 bg-danger-dim", icon: <AlertTriangle className="h-4 w-4 text-danger" /> },
};

export function ResultCard({
  run,
  kpiMargin,
  onGoBack,
}: {
  run: RunView | null;
  kpiMargin: number | null;
  onGoBack: (step: StepId) => void;
}) {
  if (!run?.result) {
    return <p className="text-sm text-fg-muted">Er is nog geen afgeronde berekening om te bekijken.</p>;
  }

  const { summary } = run.result;
  const validation = run.validation;
  const verdict = steerVerdict(validation);
  const figures = headlineFigures(summary, validation, kpiMargin);
  const advice = adviceFor(summary, validation, kpiMargin);
  const inseparable = inseparableNote(validation);
  const tone = TONE[verdict.tone];

  return (
    <div className="space-y-4">
      {/* Laag 1 — kan ik hierop sturen? */}
      <div className={`rounded-xl border p-4 ${tone.box}`}>
        <p className="flex items-start gap-2 text-sm font-semibold text-fg">
          <span className="mt-0.5 flex-none">{tone.icon}</span>
          {verdict.headline}
        </p>
        <p className="mt-1.5 text-sm text-fg">{verdict.explanation}</p>
        {verdict.reasons.length > 0 && (
          <ul className="mt-2 space-y-1">
            {verdict.reasons.map((reason, i) => (
              <li key={i} className="text-xs text-fg-muted">
                • {reason}
              </li>
            ))}
          </ul>
        )}
        {verdict.remedy && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onGoBack(verdict.remedy!.step)}
              className="flex items-center gap-1.5 rounded-full border border-current/30 px-3 py-1.5 text-xs font-medium text-fg transition hover:bg-surface-3"
            >
              {verdict.remedy.label} <ArrowRight className="h-3 w-3" />
            </button>
            <p className="mt-1.5 text-[11px] text-fg-muted">{verdict.remedy.why}</p>
          </div>
        )}
        <p className="mt-2.5 text-[11px] text-fg-faint">Technisch oordeel: {verdict.levelLabel}.</p>
      </div>

      {/* Laag 2 — wat is er gebeurd? Alleen als het oordeel het toestaat. */}
      {figures.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Wat is er gebeurd</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {figures.map((figure) => (
              <div key={figure.label}>
                <p className="text-xs text-fg-muted">{figure.label}</p>
                <p className="text-xl font-semibold text-fg">{figure.value}</p>
                {/* De bandbreedte staat er altijd bij als hij bestaat. */}
                {figure.range && <p className="text-[11px] text-fg-faint">tussen {figure.range}</p>}
                {figure.note && <p className="mt-1 text-[11px] text-fg-muted">{figure.note}</p>}
              </div>
            ))}
          </div>
          {inseparable && (
            <p className="mt-3 rounded-lg border border-warn/30 bg-warn-dim px-3 py-2 text-xs text-warn">
              {inseparable}
            </p>
          )}
          {/* De duiding van de gids, als die er is. De getallen hierboven komen uit code; dit
              is uitsluitend de tekst eromheen. */}
          {run.result.client_summary && (
            <div className="mt-3 border-t border-border pt-3 text-sm text-fg">
              <Markdown text={run.result.client_summary.text} />
            </div>
          )}
        </div>
      )}

      {/* Laag 3 — wat zou ik doen? Alleen bij een model dat budgetadvies toestaat. */}
      {advice.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Wat ik zou doen</p>
          <ol className="mt-3 space-y-3">
            {advice.map((action, i) => (
              <li key={i}>
                <p className="text-sm font-medium text-fg">{action.text}</p>
                <p className="mt-0.5 text-xs text-fg-muted">{action.detail}</p>
                <p className="mt-0.5 text-[11px] text-fg-faint">Zekerheid: {action.confidence}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Laag 4 — de cijfers en de techniek. Ingeklapt: die hoeft niemand te lezen om een
          besluit te nemen, en wie wil narekenen moet alles kunnen zien. */}
      <details className="rounded-xl border border-border bg-surface-2">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fg">
          De cijfers en de techniek
        </summary>
        <div className="border-t border-border p-4">
          <SummaryView
            summary={summary}
            validation={validation}
            kpiMargin={kpiMargin}
            builderView
            onGoBack={(step) => onGoBack(step)}
          />
        </div>
      </details>
    </div>
  );
}
