// Het profiel dat bij de upload wordt gemaakt: draagt het genoeg om een bevinding te kúnnen
// laten zien?
//
// De samenvattende cijfers (min, max, aantal ontbrekend) waren er altijd al. Wat hier wordt
// bewaakt is het deel dat stap 4 nodig heeft om een vraag beantwoordbaar te maken: de reeks
// zelf, en van elk gat de weken waar het precies over gaat. Zonder dat blijft "twee weken
// geen waarde" een bewering die de gebruiker niet kan nakijken.

import { describe, expect, it } from "vitest";
import { buildSourceProfile } from "@/lib/dataProfile";

function weekly(values: (number | null)[], startWeek = 0): Record<string, unknown>[] {
  const start = Date.UTC(2025, 0, 6); // maandag
  return values.map((value, i) => ({
    week: new Date(start + (startWeek + i) * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    omzet: value,
  }));
}

describe("de reeks in het profiel", () => {
  it("draagt één label per rij en de waarden daarbij", () => {
    const profile = buildSourceProfile(["week", "omzet"], weekly([100, 110, 120]));
    expect(profile.labels).toEqual(["2025-01-06", "2025-01-13", "2025-01-20"]);
    const omzet = profile.columns.find((c) => c.name === "omzet")!;
    expect(omzet.series).toEqual([100, 110, 120]);
  });

  it("houdt een lege cel leeg in plaats van hem op nul te zetten", () => {
    // Een nul is een waarde ("er is niets verkocht"), een leeg vakje is het ontbreken van een
    // waarde. Wie die twee door elkaar haalt, tekent een dip die er niet is.
    const profile = buildSourceProfile(["week", "omzet"], weekly([100, null, 0, 120]));
    const omzet = profile.columns.find((c) => c.name === "omzet")!;
    expect(omzet.series).toEqual([100, null, 0, 120]);
  });

  it("zegt van elk gat om welke weken het gaat", () => {
    const profile = buildSourceProfile(["week", "omzet"], weekly([100, null, null, 120, null, 90]));
    const omzet = profile.columns.find((c) => c.name === "omzet")!;
    expect(omzet.longest_missing_run).toBe(2);
    expect(omzet.missing_runs).toEqual([
      { start: 1, length: 2, start_label: "2025-01-13", end_label: "2025-01-20" },
      { start: 4, length: 1, start_label: "2025-02-03", end_label: "2025-02-03" },
    ]);
  });

  it("telt een gat aan het einde van het bestand ook mee", () => {
    const profile = buildSourceProfile(["week", "omzet"], weekly([100, 110, null, null]));
    const omzet = profile.columns.find((c) => c.name === "omzet")!;
    expect(omzet.longest_missing_run).toBe(2);
    expect(omzet.missing_runs?.[0].start).toBe(2);
  });

  it("laat de reeks weg bij een bestand dat er te lang voor is, maar houdt de rest overeind", () => {
    // De grens bestaat zodat een uitzonderlijk bestand geen megabyte JSON in elke paginalading
    // duwt. Alles wat ervan afhangt moet zonder reeks blijven werken — de vragen blijven, de
    // grafiek vervalt.
    const rows = weekly(Array.from({ length: 1201 }, (_, i) => 100 + (i % 7)));
    const profile = buildSourceProfile(["week", "omzet"], rows);
    expect(profile.labels).toBeUndefined();
    const omzet = profile.columns.find((c) => c.name === "omzet")!;
    expect(omzet.series).toBeUndefined();
    expect(omzet.missing_runs).toEqual([]);
    expect(omzet.mean).toBeGreaterThan(0);
  });
});
