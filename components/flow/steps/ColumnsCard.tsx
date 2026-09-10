"use client";

// Stap 3 — klopt wat ik zie?
//
// Per kolom de rol en, bij een kanaal, de eenheid. Klikken, niet typen: dit is de stap
// waarin de oude wizard de gebruiker vroeg om "beschrijf wat er niet klopt" in vrije tekst,
// waarna een LLM-ronde de indeling opnieuw raadde.
//
// De eenheid staat er nadrukkelijk bij. Een kanaal in bereik of vertoningen dat voor euro's
// wordt aangezien, geeft later een rendement per euro dat nergens op slaat — en dat is aan de
// uitkomst niet te zien.

import { useEffect, useMemo, useState } from "react";
import type { ChannelUnit, ColumnMapping, ColumnMappingEntry, SourceFile } from "@/lib/types";

type Role = ColumnMappingEntry["role"];

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: "date", label: "Datum", hint: "De week of dag waar de regel over gaat." },
  { id: "kpi", label: "Mijn resultaat", hint: "Waar je op stuurt: omzet, orders, leads." },
  { id: "spend", label: "Kanaal", hint: "Wat je in een kanaal stopt: geld, vertoningen, verzendingen." },
  { id: "control", label: "Verklaart mee", hint: "Geen kanaal, wel van invloed — prijs, weer, voorraad." },
  { id: "ignore", label: "Laat weg", hint: "Doet niet mee in het model." },
];

const UNITS: { id: ChannelUnit; label: string }[] = [
  { id: "currency", label: "euro's" },
  { id: "impressions", label: "vertoningen" },
  { id: "grp", label: "GRP's" },
  { id: "clicks", label: "clicks" },
  { id: "sendings", label: "verzendingen" },
];

/** Zonder AI-classificatie: een eerlijke gok uit het profiel, die de gebruiker corrigeert. */
function fallbackMapping(source: SourceFile): ColumnMapping {
  const profile = source.profile;
  const columns: ColumnMappingEntry[] = (profile?.columns ?? []).map((col) => ({
    name: col.name,
    role: col.name === profile?.date_column ? "date" : col.kind === "numeric" ? "control" : "ignore",
    meaning: "",
    unit: null,
    confidence: "laag",
  }));
  return { granularity: "onbekend", layout: "onbekend", currency: null, reasoning: "", columns };
}

export function ColumnsCard({
  source,
  onPayloadChange,
}: {
  source: SourceFile;
  onPayloadChange: (payload: { mapping: ColumnMapping } | null) => void;
}) {
  const initial = useMemo(
    () => source.mapping ?? fallbackMapping(source),
    [source],
  );
  const [columns, setColumns] = useState<ColumnMappingEntry[]>(initial.columns);

  // De server-render kan tussendoor een verse classificatie hebben opgeleverd.
  useEffect(() => setColumns(initial.columns), [initial]);

  // Wat de gebruiker hier neerzet, is wat de bevestigknop straks meestuurt.
  useEffect(() => {
    onPayloadChange({ mapping: { ...initial, columns } });
  }, [columns, initial, onPayloadChange]);

  const counts = {
    date: columns.filter((c) => c.role === "date").length,
    kpi: columns.filter((c) => c.role === "kpi").length,
    spend: columns.filter((c) => c.role === "spend").length,
  };
  const problem =
    counts.date !== 1
      ? "Kies precies één datumkolom."
      : counts.kpi !== 1
        ? "Kies precies één kolom als je resultaat."
        : counts.spend === 0
          ? "Kies minstens één kanaal."
          : null;

  function setRole(name: string, role: Role) {
    setColumns((prev) =>
      prev.map((c) =>
        c.name === name
          ? { ...c, role, unit: role === "spend" ? (c.unit ?? "currency") : null }
          : // Datum en resultaat zijn er per definitie één: een tweede aanwijzen maakt de
            // vorige vrij, in plaats van een ongeldige toestand te laten ontstaan.
            (role === "date" && c.role === "date") || (role === "kpi" && c.role === "kpi")
            ? { ...c, role: "control" }
            : c,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-2 text-fg-faint">
            <tr>
              <th className="px-3 py-2 font-medium">Kolom</th>
              <th className="px-3 py-2 font-medium">Wat is het?</th>
              <th className="px-3 py-2 font-medium">Gemeten in</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => (
              <tr key={col.name} className="border-t border-border align-middle">
                <td className="max-w-[12rem] truncate px-3 py-2 font-medium text-fg" title={col.name}>
                  {col.name}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {ROLES.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        title={role.hint}
                        onClick={() => setRole(col.name, role.id)}
                        className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                          col.role === role.id
                            ? "bg-accent text-bg"
                            : "border border-border text-fg-muted hover:bg-surface-3"
                        }`}
                      >
                        {role.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {col.role === "spend" ? (
                    <select
                      value={col.unit ?? "currency"}
                      onChange={(e) =>
                        setColumns((prev) =>
                          prev.map((c) =>
                            c.name === col.name ? { ...c, unit: e.target.value as ChannelUnit } : c,
                          ),
                        )
                      }
                      className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-[11px] text-fg outline-none"
                    >
                      {UNITS.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-fg-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {problem && (
        <p className="rounded-lg border border-warn/30 bg-warn-dim px-3 py-2 text-xs text-warn">{problem}</p>
      )}
    </div>
  );
}
