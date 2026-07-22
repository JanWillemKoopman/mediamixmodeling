"use client";

import { AlertTriangle, TrendingUp } from "lucide-react";
import type { ProfileColumnStats, SourceFile } from "@/lib/types";

// Per geüpload bestand een gezondheidskaart uit het al bij de upload berekende
// SourceProfile (source_files.profile) — n_rows, datumbereik, cadans, missings + langste
// gat per kolom, uitschieters mét exacte week, en sterk gecorreleerde paren. Deze data
// ging tot nu toe alleen naar de AI; juist de analist heeft ze nodig om vóór het
// samenvoegen te zien of een bron deugt. Geen herberekening: puur weergave.

function fmt(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("nl-NL", { maximumFractionDigits: 1 });
}

const GRANULARITY_LABEL: Record<string, string> = { week: "wekelijks", day: "dagelijks", onbekend: "cadans onbekend" };

function ColumnRow({ stat }: { stat: ProfileColumnStats }) {
  const hasGap = stat.longest_missing_run > 0;
  const hasOutliers = stat.outliers.length > 0;
  return (
    <div className="border-t border-border py-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-fg">{stat.name}</span>
        <span className="text-fg-faint">
          {stat.kind === "numeric" ? `${fmt(stat.min)} – ${fmt(stat.max)}` : stat.kind}
        </span>
      </div>
      {(stat.n_missing > 0 || hasOutliers) && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {stat.n_missing > 0 && (
            <span className="rounded-sm bg-warn-dim px-2 py-0.5 text-[10px] text-warn">
              {stat.n_missing} ontbrekend{hasGap ? ` · langste gat ${stat.longest_missing_run} wk` : ""}
            </span>
          )}
          {hasOutliers && (
            <span
              className="inline-flex items-center gap-1 rounded-sm bg-danger-dim px-2 py-0.5 text-[10px] text-danger"
              title={stat.outliers.map((o) => `${o.label}: ${fmt(o.value)} (z=${o.z.toFixed(1)})`).join("\n")}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              {stat.outliers.length} uitschieter{stat.outliers.length === 1 ? "" : "s"}
              {stat.outliers[0] && ` (o.a. ${stat.outliers[0].label})`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function HealthCard({ file }: { file: SourceFile }) {
  const profile = file.profile;
  const cadence = file.mapping?.granularity;

  if (!profile) {
    return (
      <div className="rounded-lg border border-border p-3">
        <p className="truncate text-sm font-medium text-fg">{file.name}</p>
        <p className="mt-1 text-xs text-fg-faint">
          Geen automatisch profiel beschikbaar (bijvoorbeeld een xlsx-bestand) — gebruik “Verder
          verkennen” hieronder of vraag de AI om dit bestand te inspecteren.
        </p>
      </div>
    );
  }

  const flagged = profile.columns.filter((c) => c.n_missing > 0 || c.outliers.length > 0);
  const clean = profile.columns.length - flagged.length;

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="truncate text-sm font-medium text-fg">{file.name}</p>
      <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-fg-muted">
        <span>{profile.n_rows} rijen</span>
        {profile.date_range && <span>· {profile.date_range[0]} t/m {profile.date_range[1]}</span>}
        {cadence && <span>· {GRANULARITY_LABEL[cadence] ?? cadence}</span>}
      </p>

      {profile.high_correlations.length > 0 && (
        <div className="mt-2 rounded bg-surface-2 p-2 text-[11px] text-fg-muted">
          <p className="flex items-center gap-1 font-medium">
            <TrendingUp className="h-3 w-3" /> Sterk samenhangende kolommen:
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {profile.high_correlations.slice(0, 4).map((c, i) => (
              <li key={i}>
                {c.a} ↔ {c.b} <span className="text-fg-faint">(r={c.r.toFixed(2)})</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-fg-faint">Sterk gecorreleerde kanalen kan het model lastig uit elkaar houden.</p>
        </div>
      )}

      <div className="mt-1">
        {flagged.length === 0 ? (
          <p className="border-t border-border pt-1.5 text-xs text-success">
            Geen ontbrekende waarden of uitschieters gevonden in {profile.columns.length} kolommen.
          </p>
        ) : (
          <>
            {flagged.map((stat) => (
              <ColumnRow key={stat.name} stat={stat} />
            ))}
            {clean > 0 && (
              <p className="border-t border-border pt-1.5 text-[11px] text-fg-faint">
                + {clean} kolom{clean === 1 ? "" : "men"} zonder bijzonderheden.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function SourceHealthCards({ sources }: { sources: SourceFile[] }) {
  if (sources.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-sm text-fg-muted">
        Snelle gezondheidscheck per bestand — al berekend bij het uploaden. Zo zie je vóór het
        samenvoegen waar ontbrekende weken, uitschieters of sterk samenhangende kolommen zitten.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {sources.map((s) => (
          <HealthCard key={s.storage_path} file={s} />
        ))}
      </div>
    </div>
  );
}
