// Fase "context" — zakelijke context vóór het tunen. Drie formuliervelden (omschrijving,
// branche, marge) worden één open vraag; "overslaan" vervangt de losse skip-knop. Schrijft
// naar dezelfde mmm.project_context-rij als de AI-tool record_business_context.

import { humanizeError } from "@/lib/humanizeMessage";
import { matchOption, type MenuOption } from "@/lib/wizard/questions";
import type { TurnEnv, TurnReplyResult } from "@/lib/wizard/turns/types";

const SKIP_OPTION: MenuOption = { key: "skip", label: "overslaan", synonyms: ["overslaan", "skip", "nee", "later"] };

export function intro(): string {
  return (
    "Vertel kort: wat doet het bedrijf, in welke branche zit je, en wat is de marge per verkochte eenheid? " +
    "Grote campagnes, seizoenspieken of een eerder experiment mag je er ook bij noemen. " +
    "Typ **overslaan** als je dit nu wilt skippen."
  );
}

// Optioneel een bedrag als marge herkennen (€ 12,50 / 12,50 euro) — vereist een expliciet
// valutateken/-woord zodat een willekeurig getal in de tekst (bv. "3 vestigingen") niet per
// ongeluk als marge wordt gelezen. De architect vangt de rest van de vrije tekst (branche,
// feiten) zelf op via record_business_context.
function extractMargin(text: string): number | null {
  const m = text.match(/€\s*(\d+(?:[.,]\d+)?)/) ?? text.match(/(\d+(?:[.,]\d+)?)\s*(?:euro|eur)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function resolve(env: TurnEnv, reply: string): Promise<TurnReplyResult> {
  if (matchOption(reply, [SKIP_OPTION])) {
    env.skipBusinessContext();
    return {
      handled: true,
      reply: "Prima, we slaan dit voorlopig over — je kunt het altijd nog nabespreken in de chat. Nu gaan we het model afstemmen.",
    };
  }

  const res = await fetch("/api/business-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: env.projectId,
      description: reply,
      industry: "",
      kpi_margin: extractMargin(reply),
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return { handled: true, reply: humanizeError(j.error, "Opslaan is niet gelukt — probeer het opnieuw.").text };
  }
  return { handled: true, refresh: true, reply: "Genoteerd — dat helpt om betere aannames te kiezen. Nu gaan we het model afstemmen." };
}
