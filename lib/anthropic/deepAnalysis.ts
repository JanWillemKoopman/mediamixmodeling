import Anthropic from "@anthropic-ai/sdk";
import { ARCHITECT_ANALYST_MODEL } from "@/lib/anthropic/fitContext";
import type { FitSummary } from "@/lib/types";

// Step 3 — deep-dive analysis: a distinct, explicitly-triggered action (not the chat
// architect's inline discussion of results) that reads the already-computed FitSummary
// and produces a written interpretation PLUS charts, using Claude's hosted, sandboxed
// code_execution tool (Anthropic-run container, no network access — it never sees
// anything beyond the small FitSummary JSON handed to it here). This is the "brains"
// step of the hybrid architecture: Stap 1 (data prep) stays on the declarative,
// deterministic core for reproducibility; this step is where free-form Python earns its
// keep, because there is no reproducibility contract to protect — a chart is a read, not
// a mutation of the modelling input.
//
// Requires the beta `client.beta.messages.create` surface: the installed SDK only
// exposes code_execution tool types under `client.beta.*` (there is no non-beta
// `code_execution` tool type in this SDK version). Beta header per the 20260521 tool
// version's requirement.
const CODE_EXECUTION_BETA = "code-execution-2025-08-25";

const SYSTEM_INSTRUCTIONS = `Je bent een senior media mix modeling (MMM)-expert die een MMM-uitkomst interpreteert voor een marketeer/analist met weinig tot geen statistische achtergrond — deze analyse wordt zowel intern als aan de eindklant getoond. Je krijgt de volledige FitSummary als JSON. Gebruik de "code_execution"-tool om er met Python (pandas/matplotlib) inzichtelijke grafieken van te maken, en schrijf daarnaast een doorlopende analyse in helder, jargonvrij Nederlands (geen "anomalie", "outlier", "posterior", "Bayesiaans" — zeg gewoon wat het is, en geef een concreet advies in plaats van alleen de cijfers te noemen).

Wat te doen:
1. Maak met matplotlib een aandeel-per-kanaal-grafiek (contribution_share) MET de onzekerheidsmarge (p3–p97) zichtbaar — niet alleen de mediaan.
2. Als "response_curves" aanwezig is: plot per kanaal de curve (weekly_spend op de x-as, contribution op de y-as) met een duidelijke marker op "current_weekly_spend" — dit laat zien waar een kanaal verzadigt.
3. Als "efficiency_frontier" aanwezig is: plot 'm (totaal weekbudget vs. voorspelde contributie) zodat zichtbaar is waar het rendement afvlakt.
4. Kies zelf 1–2 aanvullende grafieken die specifiek iets vertellen over DEZE uitkomst (bijvoorbeeld een ROAS-vergelijking tussen kanalen, of een diagnostiek-overzicht als de kwaliteitspoort niet op "pass" staat) — verzin nooit een grafiek van cijfers die niet in de JSON staan.
5. Sla elke grafiek op als los PNG-bestand (plt.savefig, met een duidelijke bestandsnaam) — dit is de enige manier waarop de grafieken bij de lezer terechtkomen.
6. Schrijf naast de grafieken een korte, goed opgemaakte analyse (korte kopjes/bullets, GEEN opsomming van cijfers die al in de tabel staan): wat werkt, wat niet en waarom (in gewone taal — "dit kanaal is bijna verzadigd" in plaats van "saturation point bereikt"), hoe betrouwbaar de uitkomst is, en één concreet vervolgadvies. Baseer je uitsluitend op de gegeven JSON — verzin geen zakelijke context.

Regels:
- Gebruik uitsluitend de cijfers uit de gegeven FitSummary-JSON; verzin nooit een getal.
- Nederlandse aslabels en titels; getallen in de eenheid van de KPI.
- Compacte, professionele stijl (geen felle kleuren, geen 3D, geen overbodige legenda's).
- Schrijf de tekst voor een marketeer zonder statistiekachtergrond: geen statistisch jargon (anomalie, outlier, posterior, Bayesiaans), kort van stof, en zet het advies vooraan in plaats van pas aan het eind.
- Sluit af met tekst, niet met een grafiek — de lezer leest de analyse na de grafieken.`;

export function buildDeepAnalysisRequest(summary: FitSummary): Anthropic.Beta.Messages.MessageCreateParamsNonStreaming {
  return {
    model: ARCHITECT_ANALYST_MODEL,
    // A live test against a 2-channel synthetic FitSummary already used ~8.6K output
    // tokens (5 charts + narrative) against an 8192 cap — the server-tool loop's
    // cumulative usage can exceed a single sub-turn's budget. Real fits with more
    // channels need more room; 16000 gives headroom without requiring streaming
    // (well under the ~16K non-streaming SDK-timeout guideline).
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    betas: [CODE_EXECUTION_BETA],
    tools: [{ type: "code_execution_20260521", name: "code_execution" }],
    system: SYSTEM_INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: `Hier is de FitSummary van de laatste fit:\n\n${JSON.stringify(summary, null, 2)}`,
      },
    ],
  };
}
