// De gids: wat de AI in dit traject mag zeggen en doen.
//
// Dit vervangt `lib/anthropic/architect.ts` voor de nieuwe flow. Twee dingen waren daar mis,
// en ze hangen samen (zie docs/CHAT_PIPELINE_HERZIENING.md §2.4):
//
//   1. De prompt was achtergelopen op de code. Hij instrueerde nog over `storage_path`,
//      een knop "Controleer & voeg samen", en een reeks velden die bij de intent-refactor zijn
//      verdwenen — `channel_type`, `adstock: "delayed"`, `l_max`, `expected_half_life`,
//      `calibration`, `student_t`. Elders in dezelfde prompt stond dat die velden niet
//      bestaan. Het model kreeg dus twee tegenstrijdige werkelijkheden en moest zelf kiezen.
//   2. De prompt droeg op proactief te zijn ("wacht niet tot de gebruiker een vraag stelt"),
//      terwijl de architectuur de AI uitsluitend inschakelde bij vrij typen. Initiatief kwam
//      daardoor op willekeurige momenten en nooit waar het hoorde.
//
// Beide zijn hier structureel afgedicht in plaats van tekstueel gecorrigeerd:
//
//   * Wat de gebruiker in deze stap kán doen, wordt GEGENEREERD uit de gedeclareerde acties
//     van die stap (lib/flow/steps.ts). Een knop die niet bestaat, kan dus niet in de prompt
//     belanden; een knop die erbij komt, staat er automatisch in.
//   * De woordenschat die de gids mag gebruiken, wordt GEGENEREERD uit dezelfde vraaglijsten
//     die de kaart rendert (lib/flow/beliefs.ts). Een verwijderde optie verdwijnt mee.
//   * Proactiviteit zit in de flow, niet in de gids: elke stap wordt geopend met vaste tekst
//     (0 tokens). De gids antwoordt op vragen en vult op verzoek in. Dat staat ook zo in de
//     prompt, zonder tegenstrijdige tweede opdracht.

import Anthropic from "@anthropic-ai/sdk";
import {
  CHANNEL_QUESTIONS,
  MEDIA_SHARE_QUESTION,
  SEASONALITY_QUESTION,
  channelsOf,
} from "@/lib/flow/beliefs";
import { STEPS, type StepId } from "@/lib/flow/steps";
import type { FlowState } from "@/lib/flow/state";
import { VALIDATION_LEVEL_LABEL, type ProjectSnapshot } from "@/lib/types";

export const GUIDE_MODEL = "claude-opus-5";

/**
 * Het model voor de langere schrijfklussen: de klantsamenvatting en de uitgebreide analyse.
 *
 * Stond in `lib/anthropic/fitContext.ts`, samen met de contextopbouw voor de verwijderde
 * architect. Losse constante zodat die twee taken onafhankelijk van de gids kunnen verschuiven.
 */
export const ANALYST_MODEL = "claude-opus-5";

/**
 * De stabiele kern van de prompt.
 *
 * Byte-identiek bij elke aanvraag, voor elk project — de ideale kandidaat voor prompt-caching.
 * Alles wat per project verschilt staat in de briefing eronder.
 */
export const GUIDE_SYSTEM = `Je bent een ervaren media mix modeling-expert die optreedt als gids binnen een vaste, genummerde flow van acht stappen. De gebruiker is een marketeer zonder statistische achtergrond.

WIE LEIDT
De flow leidt, jij niet. Elke stap wordt geopend met een vaste tekst en biedt knoppen aan; de gebruiker weet dus altijd waar hij is en wat hij kan doen. Jouw rol is smal en waardevol: je legt uit, je antwoordt op vragen, en je vult op verzoek een stap voor hem in. Je stuurt de gebruiker niet naar een andere stap dan waar hij staat, en je stelt geen vragenlijsten voor die de flow al stelt.

WAT JE NOOIT DOET
- Je noemt geen getal dat je niet letterlijk in de context hieronder hebt gekregen. Verzin nooit een percentage, een bedrag, een ROAS of een halfwaardetijd. Een verzonnen getal in een verder kloppende zin is niet te onderscheiden van een juist getal, en dat is het gevaarlijkste wat je in dit product kunt doen.
- Je stelt geen modelinstellingen voor als getal: geen spreidingen, geen halfwaardetijden in weken, geen rekeninstellingen. Die bestaan niet als invoer. De rekenkern leidt ze af uit de woorden die de gebruiker kiest plus de gemeten eigenschappen van zijn data.
- Je verklaart een model nooit goed. Het oordeel komt uit de rekenkern; jij legt het uit, ook als het ongunstig is.
- Je verbergt onzekerheid niet. Een brede bandbreedte is een eerlijke uitspraak, geen fout.
- Je verzint geen zakelijke context. Je legt alleen vast wat de gebruiker daadwerkelijk zegt.

HOE JE SCHRIJFT
- Kort. Het advies vooraan, niet aan het eind.
- Geen statistisch jargon dat een marketeer niet spontaan zou zeggen. Niet: anomalie, outlier, confounding, posterior, prior, Bayesiaans, MCMC, convergentie, R-hat, adstock, saturatie, collineair. Zeg gewoon wat het is — een opvallende week, kanalen die te veel op elkaar lijken om apart te beoordelen, hoe lang een kanaal doorwerkt.
- Concreet: noem het kanaal, de week, het getal dat je in de context hebt gekregen. Nooit "er lijkt iets aan de hand" zonder te zeggen wat en waar.
- Eén duidelijke aanbeveling in plaats van drie opties. Moet je toch kiezen, geef dan je voorkeur.
- Nederlands.

HET MODEL ERACHTER, IN ÉÉN REGEL
Het rekent met bandbreedtes in plaats van losse getallen: elke uitkomst komt met een realistische marge eromheen. Dat mag je zo zeggen. De wiskundige termen erachter hoef je nooit te gebruiken.`;

// --- de woordenschat, gegenereerd uit de vragen die de kaart stelt ----------------------

/**
 * Welke woorden de gids mag kiezen, met de vraag waar ze bij horen.
 *
 * Gegenereerd, niet uitgeschreven: de prompt kan daardoor niet een optie noemen die uit de
 * kaart is verdwenen, en een nieuwe optie hoeft niet op twee plekken te worden bijgewerkt.
 */
export function vocabularyBlock(): string {
  const lines: string[] = ["De gesloten woordenschat. Alleen deze woorden bestaan als antwoord:"];
  for (const question of CHANNEL_QUESTIONS) {
    lines.push(
      `- ${question.id} — "${question.ask("<kanaal>")}" → ${question.options.map((o) => `"${o.value}" (${o.label})`).join(", ")}`,
    );
  }
  lines.push(
    `- seasonality — "${SEASONALITY_QUESTION.ask}" → ${SEASONALITY_QUESTION.options.map((o) => `"${o.value}" (${o.label})`).join(", ")}`,
  );
  lines.push(
    `- media_share — "${MEDIA_SHARE_QUESTION.ask}" → ${MEDIA_SHARE_QUESTION.options.map((o) => `"${o.value}" (${o.label})`).join(", ")}. Weet je het niet: laat het veld weg.`,
  );
  return lines.join("\n");
}

// --- de briefing: waar staat de gebruiker, en wat kan hij hier ---------------------------

/**
 * Wat de gebruiker in deze stap kan doen — gegenereerd uit de gedeclareerde acties.
 *
 * Dit is de reparatie van de prompt-drift. De oude prompt beschreef knoppen uit zijn hoofd;
 * deze leest ze af. Een knop die niet bestaat, kan hier niet staan.
 */
function actionsBlock(state: FlowState, stepId: StepId): string {
  const step = state.steps.find((s) => s.id === stepId);
  if (!step || step.actions.length === 0) {
    return "Er is op dit moment geen knop: er loopt iets, of deze stap wacht op een eerdere.";
  }
  const lines = step.actions.map((action) => {
    const extra = action.goTo
      ? ` (gaat terug naar stap ${STEPS[action.goTo].number})`
      : action.confirms
        ? " (vraagt eerst om bevestiging)"
        : "";
    return `- "${action.label}"${extra}`;
  });
  return `De knoppen die de gebruiker nu ziet:\n${lines.join("\n")}`;
}

/** De feiten van dit project die in elke stap relevant zijn. Alleen wat er werkelijk staat. */
function factsBlock(snapshot: ProjectSnapshot): string {
  const lines: string[] = [];
  const source = snapshot.sources[0];
  if (source) {
    lines.push(`Bestand: ${source.name}.`);
    const profile = source.profile;
    if (profile?.date_range) {
      lines.push(`Periode in het bestand: ${profile.date_range[0]} t/m ${profile.date_range[1]} (${profile.n_rows} rijen).`);
    }
    if (source.mapping) {
      const roleOf = (role: string) =>
        source.mapping!.columns.filter((c) => c.role === role).map((c) => c.name);
      lines.push(`Resultaatkolom: ${roleOf("kpi").join(", ") || "(nog niet aangewezen)"}.`);
      const channels = source.mapping.columns.filter((c) => c.role === "spend");
      if (channels.length > 0) {
        lines.push(
          `Kanalen: ${channels.map((c) => `${c.name}${c.unit ? ` (${c.unit})` : ""}`).join(", ")}.`,
        );
      }
      const controls = roleOf("control");
      if (controls.length > 0) lines.push(`Verklaart mee: ${controls.join(", ")}.`);
    }
    // Uitschieters en gaten komen uit het profiel, met week én waarde, zodat de gids concreet
    // kan zijn in plaats van "misschien een piek".
    const outliers = (profile?.columns ?? []).flatMap((c) =>
      c.outliers.slice(0, 2).map((o) => `${c.name} in ${o.label}: ${o.value}`),
    );
    if (outliers.length > 0) lines.push(`Opvallende waarden: ${outliers.slice(0, 6).join("; ")}.`);
    const correlated = (profile?.high_correlations ?? []).filter((p) => Math.abs(p.r) >= 0.9);
    if (correlated.length > 0) {
      lines.push(
        `Kolommen die bijna identiek meebewegen: ${correlated.map((p) => `${p.a} en ${p.b} (r=${p.r})`).join("; ")}.`,
      );
    }
  }

  const dataset = snapshot.approvedDataset ?? snapshot.dataset;
  if (dataset) {
    lines.push(
      `Klaargemaakte data: ${dataset.n_weeks ?? "?"} weken${dataset.window_start ? ` (${dataset.window_start} t/m ${dataset.window_end})` : ""}, status ${dataset.status}${dataset.approved_at ? ", goedgekeurd" : ""}.`,
    );
    const issues = dataset.suitability?.issues ?? [];
    if (issues.length > 0) {
      lines.push(
        `Kwaliteitsmeldingen: ${issues.slice(0, 8).map((i) => `${i.severity}: ${i.message}`).join("; ")}.`,
      );
    }
  }
  if (snapshot.approvedDataset) {
    const channels = channelsOf(snapshot.approvedDataset);
    if (channels.length > 0) {
      lines.push(`Kanalen in het model: ${channels.map((c) => `${c.name} (${c.unit})`).join(", ")}.`);
    }
  }

  const latest = snapshot.runs[0];
  if (latest) {
    lines.push(`Laatste berekening: ${latest.run.state}${latest.run.error_message ? ` — ${latest.run.error_message}` : ""}.`);
    if (latest.validation) {
      lines.push(`Oordeel: ${VALIDATION_LEVEL_LABEL[latest.validation.level]}.`);
      if (latest.validation.blocking_reasons.length > 0) {
        lines.push(`Wat blokkeert: ${latest.validation.blocking_reasons.join("; ")}.`);
      }
      if (latest.validation.warning_reasons.length > 0) {
        lines.push(`Aandachtspunten: ${latest.validation.warning_reasons.join("; ")}.`);
      }
    }
    // De cijfers zelf gaan mee zodat de gids ze kan uitleggen — en uitsluitend déze cijfers
    // mag noemen. Dat staat ook in de systeemprompt.
    const summary = latest.result?.summary;
    if (summary) {
      const rows = summary.channels.map(
        (c) =>
          `${c.name}: aandeel ${(c.contribution_share.p50 * 100).toFixed(1)}% (${(c.contribution_share.p3 * 100).toFixed(1)}–${(c.contribution_share.p97 * 100).toFixed(1)}%)`,
      );
      lines.push(`Bijdrage per kanaal: ${rows.join("; ")}.`);
    }
  }

  const context = snapshot.context;
  if (context?.industry) lines.push(`Branche: ${context.industry}.`);
  if (context?.description) lines.push(`Over het bedrijf: ${context.description}`);
  for (const note of context?.notes ?? []) lines.push(`Vastgelegd: ${note.fact}`);

  const inspection = snapshot.inspection;
  if (inspection?.status === "done" && inspection.narrative) {
    lines.push(`Uit de grondige data-inspectie: ${inspection.narrative}`);
  }

  return lines.length > 0 ? `Wat er over dit project vastligt:\n${lines.join("\n")}` : "Er ligt nog niets vast.";
}

/** De volledige briefing voor één beurt. */
export function briefing(snapshot: ProjectSnapshot, state: FlowState, stepId: StepId): string {
  const step = STEPS[stepId];
  const others = state.steps
    .filter((s) => s.summary)
    .map((s) => `stap ${s.number} (${s.label}): ${s.summary}`);

  return [
    `De gebruiker staat in stap ${step.number} van 8: ${step.label}.`,
    `Waar die stap voor is: ${step.purpose}`,
    actionsBlock(state, stepId),
    others.length > 0 ? `Eerder besloten:\n${others.map((o) => `- ${o}`).join("\n")}` : "",
    factsBlock(snapshot),
    stepId === "beliefs" ? vocabularyBlock() : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// --- het ene gereedschap dat de gids heeft ------------------------------------------------

/**
 * Een voorstel voor stap 5, in dezelfde gesloten woordenschat als de kaart.
 *
 * Het schema wordt gegenereerd uit de vraaglijsten, dus het kan niet een waarde toelaten die
 * de kaart niet kent — en er is geen enkel numeriek veld in te vullen. Een taalmodel kan hier
 * het verkeerde wóórd kiezen; een absurd getal kan het niet.
 */
export function proposeBeliefsTool(channelNames: string[]): Anthropic.Tool {
  const enumOf = (id: "carryover" | "strength" | "saturation") =>
    CHANNEL_QUESTIONS.find((q) => q.id === id)!.options.map((o) => o.value);

  return {
    name: "propose_beliefs",
    description:
      "Stel voor wat de gebruiker per kanaal verwacht, op basis van de kanaalnamen en wat er over " +
      "het bedrijf bekend is. Het blijft een voorstel: de gebruiker ziet het ingevuld staan en past " +
      "het aan voordat er iets mee gebeurt. Roep dit alleen aan als je om een voorstel bent gevraagd.",
    input_schema: {
      type: "object",
      properties: {
        reasoning: {
          type: "string",
          description:
            "Waarom je dit voorstelt, in twee of drie zinnen, in gewone taal. Benoem waar je onzeker " +
            "over bent — dat gaat naar een mens die het kan corrigeren.",
        },
        channels: {
          type: "object",
          description: `Per kanaal je voorstel. Gebruik exact deze kanaalnamen: ${channelNames.join(", ")}.`,
          additionalProperties: {
            type: "object",
            properties: {
              carryover: { type: "string", enum: enumOf("carryover") },
              strength: { type: "string", enum: enumOf("strength") },
              saturation: { type: "string", enum: enumOf("saturation") },
            },
          },
        },
        seasonality: { type: "string", enum: SEASONALITY_QUESTION.options.map((o) => o.value) },
        media_share: {
          type: "string",
          enum: MEDIA_SHARE_QUESTION.options.map((o) => o.value),
          description: "Laat weg als je het niet weet — dan rekent de kern met zijn eigen middenwaarde.",
        },
      },
      required: ["reasoning", "channels"],
    },
  };
}

/** De vaste vragen achter de drie AI-knoppen in de flow. */
export const PRESET_ASK: Record<string, string> = {
  "beliefs.suggest":
    "Vul de vragen van deze stap voor me in op basis van mijn kanaalnamen en wat je over mijn bedrijf " +
    "weet. Gebruik propose_beliefs en leg per kanaal kort uit waarom. Weet je iets niet, kies dan " +
    '"unknown" — dat is beter dan gokken.',
  "launch.diagnose":
    "Leg uit waarom mijn berekening niet is afgemaakt, in gewone taal, en zeg wat ik eraan kan doen. " +
    "Als het aan mijn verwachtingen ligt, stel dan met propose_beliefs een aangepaste set voor.",
  "results.explain":
    "Leg uit wat deze uitkomst betekent en wat ik ermee kan. Gebruik uitsluitend de cijfers die je in " +
    "de context hebt gekregen en noem de bandbreedte erbij. Als het model iets niet kan zeggen, zeg dat dan.",
};
