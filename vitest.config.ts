import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

// De frontend had geen enkele test; CI draaide alleen lint, typecheck en build. De
// flow-logica (lib/flow/) is pure functies, en juist daar zitten de regels die niet mogen
// verschuiven — zie docs/CHAT_PIPELINE_HERZIENING.md §8.2.
//
// Node-omgeving, geen jsdom: hier wordt geen enkele React-component gerenderd. Dat is geen
// tekortkoming maar het punt — de toestand van het traject is af te leiden zonder browser,
// en dat maakt hem uitputtend toetsbaar.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
