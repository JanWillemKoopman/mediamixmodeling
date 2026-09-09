import fs from "fs";
import path from "path";

// Server-only: reads the builder-facing MMM handleiding straight from the repo so the
// in-app "Handleiding"-knop always shows the same document that ships with the codebase,
// with nothing to keep in sync by hand. Only called from Server Components (project pages),
// never from the client bundle.
const HANDLEIDING_PATH = path.join(process.cwd(), "docs", "HANDLEIDING.md");

export function getHandleidingMarkdown(): string {
  // Faalt zacht: een ontbrekend bestand (bv. niet meegenomen in de deploy-trace) mag nooit
  // een projectpagina laten crashen — de handleiding is hulp, geen voorwaarde.
  try {
    return fs.readFileSync(HANDLEIDING_PATH, "utf-8");
  } catch {
    return "De handleiding kon niet geladen worden. Zie `docs/HANDLEIDING.md` in de repository.";
  }
}
