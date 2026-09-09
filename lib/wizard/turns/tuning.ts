// Fase "tuning" — het model afstemmen op wat de gebruiker al weet.
//
// De gebruiker kiest hier geen getallen. Hij beschrijft wat hij gelooft; de rekenkern leidt
// daar de instellingen uit af, samen met de gemeten eigenschappen van déze dataset. Dat is
// waarom er geen invoervelden voor priors meer zijn: die konden alleen maar verkeerd
// ingevuld worden, en de goede waarde hangt af van iets dat je moet méten.

import { humanizeError } from "@/lib/humanizeMessage";
import { postJson } from "@/lib/fetchJson";
import { formatMenu, matchOption, type MenuOption } from "@/lib/wizard/questions";
import { describeIntent, templateIntentFromDataset } from "@/lib/wizard/tuningDefaults";
import type { ModelIntent } from "@/lib/types";
import type { TurnEnv, TurnReplyResult } from "@/lib/wizard/turns/types";

const TUNING_OPTIONS: MenuOption[] = [
  {
    key: "ai",
    label: "Laat de AI het afstemmen op mijn data en context",
    synonyms: ["ja", "aanbevolen", "ai", "optimaliseer", "afstemmen"],
  },
  { key: "manual", label: "Ik wil zelf iets aangeven", synonyms: ["zelf", "aanpassen", "handmatig"] },
  {
    key: "defaults",
    label: "Gebruik de neutrale instellingen en reken meteen",
    synonyms: ["standaard", "neutraal", "meteen", "gewoon rekenen"],
  },
];

export const AI_OPTIMIZE_MESSAGE =
  "Kijk naar de goedgekeurde dataset en de zakelijke context en stel met propose_model_intent " +
  "een modelintentie voor: per kanaal de eenheid, de rol, de verwachte na-ijl, de verwachte " +
  "kracht en de verzadiging, plus het KPI-type, het seizoen en het verwachte aandeel van " +
  "marketing. Leg per keuze kort uit waaróm.";

export function intro(env: TurnEnv): string {
  const base = env.reuseIntent
    ? "Ik gebruik de afstemming van de eerder gekozen berekening als startpunt.\n\n"
    : "";
  return (
    `${base}Nu stemmen we het model af op wat jij al weet. Je kiest geen getallen — je zegt ` +
    `wat je verwacht, en ik reken uit wat dat voor jouw data betekent.\n\n${formatMenu(TUNING_OPTIONS)}`
  );
}

/** Store the intent as a configuration, then start the run. Two steps, one confirmation. */
export async function startRun(
  env: TurnEnv,
  intent: ModelIntent,
): Promise<TurnReplyResult> {
  const dataset = env.approvedDataset;
  if (!dataset) {
    return { handled: true, reply: "Er is nog geen goedgekeurde dataset om op te rekenen." };
  }

  const configured = await postJson<{ model_configuration_id: string; problems?: string[] }>(
    "/api/model-configurations",
    { project_id: env.projectId, dataset_version_id: dataset.id, intent },
  );
  if (!configured.ok) {
    return {
      handled: true,
      reply: humanizeError(configured.error, "De afstemming kon niet worden vastgelegd.").text,
    };
  }

  const started = await postJson<{ model_run_id: string; reused: boolean }>("/api/runs", {
    project_id: env.projectId,
    model_configuration_id: configured.data.model_configuration_id,
  });
  if (!started.ok) {
    return { handled: true, reply: humanizeError(started.error, "De berekening kon niet gestart worden.").text };
  }
  if (started.data.reused) {
    return {
      handled: true,
      refresh: true,
      reply:
        "Deze berekening bestaat al — precies dezelfde afstemming op dezelfde data. Ik toon " +
        "hem hieronder in plaats van hem nog een keer te draaien.",
    };
  }
  return {
    handled: true,
    refresh: true,
    reply:
      "De berekening start. Eerst toets ik of je verwachtingen bij je data passen, daarna " +
      "reken ik door — dat duurt meestal 3 tot 5 minuten. Je ziet hier vanzelf hoe ver het is.",
  };
}

export async function resolve(env: TurnEnv, reply: string): Promise<TurnReplyResult> {
  if (!env.approvedDataset) return { handled: false };
  const match = matchOption(reply, TUNING_OPTIONS);
  if (!match) return { handled: false };

  if (match.key === "ai") {
    env.askArchitect(AI_OPTIMIZE_MESSAGE);
    return { handled: true, delegatedBusy: true };
  }

  if (match.key === "manual") {
    return {
      handled: true,
      reply:
        "Prima — beschrijf per onderwerp wat je weet. Bijvoorbeeld: \"tv werkt bij ons wekenlang " +
        "door\", \"van social verwacht ik weinig\", \"search zit al tegen zijn plafond aan\", of " +
        "\"marketing drijft bij ons hooguit een op de zeven verkopen\". Ik verwerk het in een " +
        "voorstel dat je kunt goedkeuren.",
    };
  }

  // "Neutraal": every belief stays "unknown", which is an honest position rather than a
  // hidden assumption — the data then carries the full weight.
  const intent = env.reuseIntent ?? templateIntentFromDataset(env.approvedDataset);
  const result = await startRun(env, intent);
  return {
    ...result,
    reply: result.reply
      ? `Ik reken met neutrale verwachtingen — je data bepaalt dan alles.\n\n${describeIntent(intent)}\n\n${result.reply}`
      : undefined,
  };
}
