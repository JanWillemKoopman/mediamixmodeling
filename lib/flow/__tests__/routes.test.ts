// Elke aangeroepen API-route moet bestaan.
//
// `fetch("/api/model-configurations/" + id)` is voor de compiler een string als elke andere.
// Zo kon lib/wizard/turns/review.ts jarenlang een route aanroepen die er niet is: de functie
// "gebruik de afstemming van run N" faalde altijd, en niets in lint, typecheck of build zei
// er iets over. Deze test legt elke /api/…-string in de broncode naast de routebestanden op
// schijf. Dat is de hele categorie, niet dat ene geval.

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const SOURCE_DIRS = ["app", "components", "lib"];
const API_ROOT = path.join(ROOT, "app", "api");

function walk(dir: string, match: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...walk(full, match));
    } else if (match(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** De routes die daadwerkelijk op schijf staan, als segmentpaden: ["api","datasets"]. */
function definedRoutes(): string[][] {
  return walk(API_ROOT, (f) => f === "route.ts").map((file) =>
    path
      .relative(path.join(ROOT, "app"), path.dirname(file))
      .split(path.sep),
  );
}

/**
 * Past een aangeroepen pad op een gedefinieerde route?
 *
 * Een dynamisch segment ([id], [projectId]) matcht elk enkel segment; een catch-all
 * ([...slug]) matcht de rest. Zo telt `/api/datasets/abc/approve` als een treffer op
 * `app/api/datasets/[id]/approve/route.ts`.
 */
function matches(called: string[], route: string[]): boolean {
  let i = 0;
  for (; i < route.length; i++) {
    const seg = route[i];
    if (seg.startsWith("[...")) return true;
    if (i >= called.length) return false;
    if (seg.startsWith("[")) continue;
    if (seg !== called[i]) return false;
  }
  return i === called.length;
}

/** Alle /api/…-paden die de broncode aanroept, met het bestand waar ze staan. */
function calledRoutes(): { file: string; route: string }[] {
  const found: { file: string; route: string }[] = [];
  const files = SOURCE_DIRS.flatMap((d) =>
    walk(path.join(ROOT, d), (f) => f.endsWith(".ts") || f.endsWith(".tsx")),
  ).filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`));

  for (const file of files) {
    // Alleen de routes die de app zelf aanroept, niet de routes die hij definieert.
    if (file.startsWith(API_ROOT + path.sep) && file.endsWith("route.ts")) continue;
    const text = readFileSync(file, "utf8");
    // Zowel "/api/x" als `/api/x/${id}/y` — het interpolatiedeel wordt een joker.
    for (const m of text.matchAll(/["'`](\/api\/[^"'`\s]*)["'`]/g)) {
      found.push({ file: path.relative(ROOT, file), route: m[1] });
    }
  }
  return found;
}

describe("elke aangeroepen API-route bestaat", () => {
  const routes = definedRoutes();

  it("vindt de routes op schijf", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it("vindt de aanroepen in de broncode", () => {
    expect(calledRoutes().length).toBeGreaterThan(5);
  });

  it("elke aanroep wijst naar een bestaande route", () => {
    const missing: string[] = [];
    for (const { file, route } of calledRoutes()) {
      const called = route
        .replace(/\$\{[^}]*\}/g, "*") // template-interpolatie wordt één segment
        .split("?")[0]
        .split("/")
        .filter(Boolean);
      // "/api/" op zichzelf is geen aanroep maar een voorvoegsel (app/robots.ts sluit de
      // hele map uit voor zoekmachines). Een echte aanroep noemt minstens één route.
      if (called.length < 2) continue;
      if (!routes.some((r) => matches(called, r))) missing.push(`${route}  (aangeroepen in ${file})`);
    }
    expect(missing, `deze routes worden aangeroepen maar bestaan niet:\n${missing.join("\n")}`).toEqual([]);
  });
});
