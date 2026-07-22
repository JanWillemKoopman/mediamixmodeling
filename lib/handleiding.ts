import fs from "fs";
import path from "path";

// Server-only: reads the builder-facing MMM handleiding straight from the repo so the
// in-app "Handleiding"-knop always shows the same document that ships with the codebase,
// with nothing to keep in sync by hand. Only called from Server Components (project pages),
// never from the client bundle.
const HANDLEIDING_PATH = path.join(process.cwd(), "MMM_HANDLEIDING_DATA_ANALIST.md");

export function getHandleidingMarkdown(): string {
  return fs.readFileSync(HANDLEIDING_PATH, "utf-8");
}
