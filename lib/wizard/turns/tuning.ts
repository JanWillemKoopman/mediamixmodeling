// Fase "tuning" — de grootste vereenvoudiging. Het hele handmatige per-kanaal
// select/number-formulier (channel_type/adstock/saturatie/priors/baseline/rekeninstellingen)
// is vervangen door één default-eerst-menu: vertrouw op de AI-aanbeveling, pas zelf iets aan
// (in gewone taal, via de architect), of doe eerst een gratis proefdraai. De architect kent
// het "onderwerp voor onderwerp per kanaal"-gesprek al (zie lib/anthropic/architect.ts) —
// hier hoeft niets opnieuw uitgevonden te worden, alleen de bevestiging wordt tekst i.p.v.
// een knop (afgehandeld door ChatWizard's generieke voorstel-lus).

import { humanizeError } from "@/lib/humanizeMessage";
import { formatMenu, matchOption, type MenuOption } from "@/lib/wizard/questions";
import { templateConfigFromDataset } from "@/lib/wizard/tuningDefaults";
import type { JobConfig } from "@/lib/types";
import type { TurnEnv, TurnReplyResult } from "@/lib/wizard/turns/types";

const TUNING_OPTIONS: MenuOption[] = [
  { key: "ai", label: "Ja, gebruik de aanbevolen instellingen", synonyms: ["ja", "aanbevolen", "ai", "optimaliseer"] },
  { key: "manual", label: "Ik wil zelf iets aanpassen", synonyms: ["zelf", "aanpassen", "handmatig"] },
  { key: "trial", label: "Draai eerst een gratis proefdraai", synonyms: ["proefdraai", "proberen", "test"] },
];

export function intro(env: TurnEnv): string {
  const base = env.reuseJobConfig
    ? "Ik gebruik de configuratie van de eerder gekozen run als startpunt. "
    : "";
  return `${base}Wil je dat ik het model afstem op basis van je data en context, of wil je zelf iets instellen?\n\n${formatMenu(TUNING_OPTIONS)}`;
}

// Aangeroepen wanneer de bouwer "1" kiest — hetzelfde kant-en-klare bericht dat de oude
// "Laat de AI optimaliseren"-knop verstuurde, nu als het resultaat van een menukeuze.
export const AI_OPTIMIZE_MESSAGE =
  "Kijk naar de goedgekeurde dataset en de zakelijke context en stel een geoptimaliseerde " +
  "modelconfiguratie voor (kanaaltypes, adstock/saturatie, trend/seizoen, likelihood).";

async function runPriorPredictive(env: TurnEnv): Promise<TurnReplyResult> {
  if (!env.dataset) return { handled: true, reply: "Er is nog geen goedgekeurde dataset om een proefdraai op te doen." };
  const base = env.reuseJobConfig ?? templateConfigFromDataset(env.dataset);
  const config: JobConfig = { sources: base.sources, model: base.model };
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: env.projectId, type: "prior_predictive", dataset_id: env.dataset.id, config }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    return { handled: true, reply: humanizeError(j.error, "De proefdraai kon niet gestart worden.").text };
  }
  return { handled: true, refresh: true, reply: "De proefdraai loopt — ik laat je hier weten wat je keuzes betekenen voor de omzet." };
}

export async function resolve(env: TurnEnv, reply: string): Promise<TurnReplyResult> {
  if (!env.dataset) return { handled: false };
  const match = matchOption(reply, TUNING_OPTIONS);
  if (!match) return { handled: false };

  if (match.key === "ai") {
    // Geen deterministisch antwoord — stuurt hetzelfde vaste verzoek naar de architect als
    // vroeger de "Laat de AI optimaliseren"-knop deed (i.p.v. het getypte cijfer zelf).
    env.askArchitect(AI_OPTIMIZE_MESSAGE);
    return { handled: true, delegatedBusy: true };
  }
  if (match.key === "manual") {
    return {
      handled: true,
      reply:
        "Prima — beschrijf per onderwerp wat je wilt (bijvoorbeeld: \"zet kanaal tv op vertraagde na-ijl\" of " +
        "\"ik verwacht weinig effect van social, zet de prior daar laag\"). Ik verwerk het in een voorstel dat je kunt goedkeuren.",
    };
  }
  if (match.key === "trial") {
    return runPriorPredictive(env);
  }
  return { handled: false };
}
