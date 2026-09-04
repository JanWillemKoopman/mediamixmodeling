"use client";

import type { HierSummary, Interval } from "@/lib/types";

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("nl-NL", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function pct(n: number): string {
  return (n * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 }) + "%";
}

function IntervalCell({ value, render }: { value: Interval; render: (n: number) => string }) {
  return (
    <div>
      <div className="font-medium text-fg">{render(value.p50)}</div>
      <div className="text-xs text-fg-faint">
        {render(value.p3)} – {render(value.p97)}
      </div>
    </div>
  );
}

// Minimal results view for a hierarchical (multi-region) fit — a plain table per channel
// (global share/ROAS, plus a per-region share breakdown) rather than the full
// SummaryView/ResultsCharts, which assume the single-region FitSummary shape (response
// curves, budget optimisation, a quality gate) that a HierSummary doesn't have.
export function HierarchicalSummaryView({ summary }: { summary: HierSummary }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border-strong bg-surface-2 p-3 text-sm text-fg-muted">
        Hiërarchisch model over {summary.regions.length} regio&apos;s ({summary.regions.join(", ")}) —{" "}
        {summary.n_weeks} weken. Kanaaleffecten zijn per regio geschat met gedeelde sterkte
        tussen regio&apos;s (partial pooling).
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-xs text-fg-muted">Max R-hat</div>
          <div className="text-sm font-medium text-fg">{fmt(summary.diagnostics.max_r_hat, 3)}</div>
        </div>
        <div>
          <div className="text-xs text-fg-muted">Divergenties</div>
          <div className="text-sm font-medium text-fg">{summary.diagnostics.n_divergences}</div>
        </div>
        <div>
          <div className="text-xs text-fg-muted">R² (gepooled)</div>
          <div className="text-sm font-medium text-fg">{fmt(summary.diagnostics.r2_pooled, 2)}</div>
        </div>
        <div>
          <div className="text-xs text-fg-muted">Decompositie klopt</div>
          <div className={`text-sm font-medium ${summary.diagnostics.decomposition_ok ? "text-fg" : "text-danger"}`}>
            {summary.diagnostics.decomposition_ok ? "Ja" : "Nee"}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full overflow-hidden rounded-2xl text-sm">
          <thead>
            <tr className="bg-surface-3 text-left text-xs font-sans-w7 uppercase tracking-wide text-fg">
              <th className="rounded-tl-2xl py-2.5 pr-3 pl-4 font-sans-w7">Kanaal</th>
              <th className="py-2.5 pr-3 font-sans-w7">Aandeel (globaal)</th>
              <th className="py-2.5 pr-3 font-sans-w7">ROAS (globaal)</th>
              {summary.regions.map((r, i) => (
                <th
                  key={r}
                  className={`py-2.5 pr-3 font-sans-w7 ${i === summary.regions.length - 1 ? "rounded-tr-2xl" : ""}`}
                >
                  Aandeel {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.channels.map((ch, i, arr) => {
              const last = i === arr.length - 1;
              return (
                <tr key={ch.name} className={i % 2 === 1 ? "bg-surface-2" : "bg-surface"}>
                  <td className={`py-2 pr-3 pl-4 font-medium text-fg ${last ? "rounded-bl-2xl" : ""}`}>{ch.name}</td>
                  <td className="py-2 pr-3">
                    <IntervalCell value={ch.global_contribution_share} render={pct} />
                  </td>
                  <td className="py-2 pr-3">
                    <IntervalCell value={ch.global_roas} render={(n) => fmt(n, 2)} />
                  </td>
                  {summary.regions.map((r, j) => (
                    <td
                      key={r}
                      className={`py-2 pr-3 ${last && j === summary.regions.length - 1 ? "rounded-br-2xl" : ""}`}
                    >
                      {ch.per_region_share[r] ? (
                        <IntervalCell value={ch.per_region_share[r]} render={pct} />
                      ) : (
                        <span className="text-fg-faint">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-fg-faint">
        Geen respons-curves, budgetoptimalisatie of kwaliteitscontrole voor hiërarchische
        modellen — deze weergave toont alleen de attributie per kanaal en regio.
      </p>
    </div>
  );
}
