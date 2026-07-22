"use client";

import { useState } from "react";
import { Card } from "@/components/ui";

// Tabbladen op het klant-dashboard. Het "Resultaten"-tabblad toont de vaste analyse
// (samenvatting + grafieken); "Scenarioplanning" is de interactieve wat-als-tool waarin de
// klant zelf een toekomstige mediamix samenstelt. Beide slots worden op de server
// samengesteld en hier als reeds-gerenderde inhoud doorgegeven; het scenario-tabblad blijft
// gemount (verborgen via CSS) zodat een half-ingevuld scenario niet verloren gaat bij het
// heen-en-weer klikken.

interface Tab {
  id: string;
  label: string;
}

export function DashboardTabs({
  results,
  scenario,
}: {
  results: React.ReactNode;
  scenario: React.ReactNode | null;
}) {
  const tabs: Tab[] = [
    { id: "results", label: "Resultaten" },
    ...(scenario ? [{ id: "scenario", label: "Scenarioplanning" }] : []),
  ];
  const [active, setActive] = useState<string>("results");

  // Zonder scenario-tabblad (bv. hiërarchische run zonder responscurves) is er niets te
  // wisselen — toon de resultaten zonder tab-balk.
  if (!scenario) return <Card>{results}</Card>;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Dashboard-weergave" className="flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const selected = active === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:shadow-glow-sm ${
                selected
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" hidden={active !== "results"}>
        <Card>{results}</Card>
      </div>
      <div role="tabpanel" hidden={active !== "scenario"}>
        <Card>{scenario}</Card>
      </div>
    </div>
  );
}
