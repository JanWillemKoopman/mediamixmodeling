import type { RunAnalysis } from "@/lib/types";
import { Markdown } from "@/components/Markdown";

// Renders the deep-analysis output (narrative + charts) produced by the code_execution
// step. Shared between the builder's ResultsView and the client-facing dashboard — same
// content, same component, since a published analysis is meant to be seen by both.
export function AnalysisView({ analysis }: { analysis: RunAnalysis }) {
  return (
    <div className="space-y-4 border-t border-border pt-4">
      <h3 className="text-sm font-medium text-fg">Diepgaande analyse</h3>
      {analysis.charts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {analysis.charts.map((chart) => (
            <figure key={chart.filename} className="rounded-lg border border-border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URL, not a Next image asset */}
              <img src={chart.data_url} alt={chart.filename} className="w-full rounded" />
            </figure>
          ))}
        </div>
      )}
      <Markdown text={analysis.text} className="text-sm leading-relaxed text-fg" />
    </div>
  );
}
