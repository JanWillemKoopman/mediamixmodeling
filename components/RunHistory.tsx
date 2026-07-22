"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWizardChatOptional } from "@/components/WizardChatContext";
import { isHierSummary, type JobConfig, type ModelRun } from "@/lib/types";

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("nl-NL", { maximumFractionDigits: digits });
}
function pct(n: number): string {
  return (n * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 }) + "%";
}
function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

function verdictLabel(run: ModelRun): { text: string; rose: boolean } {
  const verdict = run.summary?.quality_gate?.verdict;
  if (verdict === "fail") return { text: "niet betrouwbaar", rose: true };
  if (verdict === "warn") return { text: "let op", rose: true };
  return { text: "geslaagd", rose: false };
}

// A hierarchical run's `summary` has no diagnostics.r2/mape/quality_gate and no
// contribution_share per channel — CompareTable and the R²/MAPE row below assume the
// single-region FitSummary shape, so hierarchical runs get a simplified row instead and
// are excluded from the two-run comparison.

// Every fit run stays available (not just the latest) so a builder can go back to an
// earlier, better run, or compare two side by side before deciding which becomes the
// published "champion" — reusing the existing publish/is_published mechanic for that,
// rather than inventing a second, parallel concept.
export function RunHistory({
  runs,
  selectedId,
  onSelect,
  jobConfigs,
}: {
  runs: ModelRun[];
  selectedId: string;
  onSelect: (id: string) => void;
  // job_id -> de config waarmee die run is gefit; voedt de "config hergebruiken"-knop.
  jobConfigs?: Record<string, JobConfig>;
}) {
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const chat = useWizardChatOptional();
  const router = useRouter();
  const pathname = usePathname();

  // Itereren met discipline: pak de exacte config van een eerdere run als startpunt in
  // stap 4 (via het bestaande voorstel-overnemen-mechanisme, dus mét banner en undo).
  function reuseConfig(run: ModelRun) {
    const config = run.job_id ? jobConfigs?.[run.job_id] : undefined;
    if (!config || !chat) return;
    chat.applyConfig(config);
    router.replace(`${pathname}?step=config`, { scroll: false });
  }

  if (runs.length <= 1) return null;

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  const compareRuns = runs.filter((r) => compareIds.includes(r.id));

  return (
    <div className="space-y-3 border-b border-border pb-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">
          Fitgeschiedenis ({runs.length})
        </p>
        <button
          onClick={() => setCompareMode((v) => !v)}
          className="text-xs font-medium text-fg-muted hover:text-fg"
        >
          {compareMode ? "Klaar met vergelijken" : "Twee runs vergelijken"}
        </button>
      </div>

      <ul className="space-y-1.5">
        {runs.map((run) => {
          const isSelected = run.id === selectedId;
          const isCompared = compareIds.includes(run.id);
          const hier = isHierSummary(run.summary);
          return (
            <li key={run.id}>
              <button
                onClick={() => {
                  if (compareMode) {
                    if (!hier) toggleCompare(run.id); // hierarchical runs can't be compared
                  } else {
                    onSelect(run.id);
                  }
                }}
                disabled={compareMode && hier}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  compareMode && hier
                    ? "cursor-not-allowed border-border opacity-50"
                    : compareMode
                      ? isCompared
                        ? "border-accent/40 bg-accent-dim"
                        : "border-border hover:bg-surface-2"
                      : isSelected
                        ? "border-accent/40 bg-accent-dim"
                        : "border-border hover:bg-surface-2"
                }`}
              >
                <span className="flex-1 text-fg">{dateLabel(run.created_at)}</span>
                {isHierSummary(run.summary) ? (
                  <span className="text-xs text-fg-muted">Hiërarchisch — {run.summary.regions.length} regio&apos;s</span>
                ) : (
                  <>
                    <span className="text-xs text-fg-muted">
                      R² {fmt(run.summary.diagnostics.r2, 2)} · MAPE {pct(run.summary.diagnostics.mape)}
                    </span>
                    {(() => {
                      const v = verdictLabel(run);
                      return (
                        <span className={`text-xs font-medium ${v.rose ? "text-danger" : "text-fg-faint"}`}>
                          {v.text}
                        </span>
                      );
                    })()}
                  </>
                )}
                {run.is_published && (
                  <span className="rounded-sm bg-success-dim px-2 py-0.5 text-[11px] font-medium text-success">
                    gepubliceerd
                  </span>
                )}
                {!compareMode && chat && run.job_id && jobConfigs?.[run.job_id] && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      reuseConfig(run);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        reuseConfig(run);
                      }
                    }}
                    title="Vul stap 4 met de exacte configuratie van deze run als startpunt"
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-muted transition hover:border-accent/40 hover:bg-accent-dim hover:text-accent"
                  >
                    config hergebruiken
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {compareMode && compareRuns.length === 2 && <CompareTable runs={compareRuns as [ModelRun, ModelRun]} />}
      {compareMode && compareRuns.length < 2 && (
        <p className="text-xs text-fg-faint">Kies twee runs hierboven om te vergelijken.</p>
      )}
    </div>
  );
}

function CompareTable({ runs }: { runs: [ModelRun, ModelRun] }) {
  const channelNames = Array.from(
    new Set(runs.flatMap((r) => r.summary.channels.map((c) => c.name))),
  );
  const byName = runs.map((r) => new Map(r.summary.channels.map((c) => [c.name, c])));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-faint">
            <th className="p-2 font-medium"> </th>
            {runs.map((r) => (
              <th key={r.id} className="p-2 font-medium">
                {dateLabel(r.created_at)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <tr>
            <td className="p-2 text-fg-muted">R²</td>
            {runs.map((r) => (
              <td key={r.id} className="p-2 font-medium text-fg">
                {fmt(r.summary.diagnostics.r2, 2)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="p-2 text-fg-muted">MAPE</td>
            {runs.map((r) => (
              <td key={r.id} className="p-2 font-medium text-fg">
                {pct(r.summary.diagnostics.mape)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="p-2 text-fg-muted">Max R-hat</td>
            {runs.map((r) => (
              <td key={r.id} className="p-2 font-medium text-fg">
                {fmt(r.summary.diagnostics.max_r_hat, 2)}
              </td>
            ))}
          </tr>
          {channelNames.map((name) => (
            <tr key={name}>
              <td className="p-2 text-fg-muted">{name} — aandeel</td>
              {byName.map((m, i) => {
                const ch = m.get(name);
                return (
                  <td key={i} className="p-2 font-medium text-fg">
                    {ch ? pct(ch.contribution_share.p50) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
