import Anthropic from "@anthropic-ai/sdk";
import { ARCHITECT_ANALYST_MODEL } from "@/lib/anthropic/fitContext";
import type { FitSummary } from "@/lib/types";

// Klantgerichte samenvatting van een fit-resultaat — het sluitstuk van de presentatiestap
// uit de handleiding (§7): kwaliteit → contributie → onzekerheid → budgetadvies →
// vervolgstap, maar dan in klanttaal in plaats van bouwerstaal. Werkt, net als de
// diepgaande analyse, uitsluitend op de resultaat-JSON (geen ruwe klantdata) — maar dit is
// bewust een aparte, goedkopere actie: geen code-sandbox, geen grafieken, alleen tekst.

const SYSTEM_INSTRUCTIONS = `Je bent een senior media mix modeling (MMM)-expert en schrijft een presentatieklare samenvatting van een MMM-resultaat voor de EINDKLANT — een marketeer of directielid met weinig tot geen statistische achtergrond. Je krijgt de FitSummary als JSON. Schrijf in het Nederlands: helder, concreet, zonder jargon (geen "anomalie", "outlier", "posterior", "Bayesiaans" — zeg gewoon wat het is). Geef vooral duidelijk advies in plaats van een opsomming van cijfers waar de lezer zelf conclusies uit moet trekken.

Structuur (gebruik korte tussenkoppen):
1. **Hoe betrouwbaar is dit model?** — eerlijk en begrijpelijk (hoeveel weken data, hoe goed volgt het model de werkelijkheid). Vertaal R²/dekking naar gewone taal; noem de kale diagnostiekcijfers niet.
2. **Waar kwam de omzet vandaan?** — baseline eerst (en leg uit dat een grote baseline normaal is), daarna de kanalen op contributie-volgorde.
3. **Wat leverde elke marketing-euro op?** — ROAS per kanaal, ALTIJD als bandbreedte ("waarschijnlijk X, realistisch tussen Y en Z"). Onzekerheid is een feature: een brede marge betekent "hier willen we meer data of een experiment".
4. **Waar liggen de kansen?** — verzadiging en (indien aanwezig) het budgetadvies, in richtinggevende taal ("elke extra euro in kanaal A levert nu meer op dan in kanaal B"), nooit als garantie.
5. **Aanbevolen vervolgstap** — één concrete aanbeveling (bijv. een experiment voor het onzekerste kanaal, of een herijking over een paar maanden).

Regels:
- Gebruik uitsluitend cijfers uit de JSON; verzin niets en noem geen zakelijke context die er niet in staat.
- Rond af op presenteerbare aantallen; schrijf percentages en euro's zoals je ze op een slide zou zetten.
- Geen aanhef, geen afsluitende groet — dit is de inhoud van een rapportpagina.
- Lengte: compact genoeg om voor te dragen (richtlijn: 350-500 woorden).`;

export function buildClientSummaryRequest(summary: FitSummary): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: ARCHITECT_ANALYST_MODEL,
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: SYSTEM_INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: `Hier is de FitSummary van de gepubliceerde/beste run:\n\n${JSON.stringify(summary, null, 2)}`,
      },
    ],
  };
}
