// Stap 5 — wat de gebruiker al weet, in vragen die hij kan beantwoorden.
//
// Dit is de belangrijkste stap van het traject en tegelijk de gevoeligste. Wat hier wordt
// vastgelegd is de zwaarst wegende input die het model krijgt, en de gebruiker is geen
// statisticus. De oplossing is niet "minder vragen" maar "andere vragen": geen getallen, geen
// halfwaardetijden, geen spreidingen — alleen uitspraken over wat hij van zijn markt weet.
//
// De vertaling naar het model gaat via de gesloten woordenschat van `ModelIntent`
// (spiegelt mmm_core.model.intent): enkel enums, geen enkel numeriek veld. De rekenkern leidt
// de priors daar zelf uit af, samen met de gemeten eigenschappen van déze dataset. Een
// verkeerd gekozen wóórd kan dus wel, een absurd getal niet.
//
// "Weet ik niet" staat overal, en even groot als de rest. Dat is geen ontsnappingsluik maar
// een echt antwoord: het zegt de rekenkern om de data zwaarder te laten wegen dan de
// verwachting. De alternatieve opzet — stilletjes "gemiddeld" invullen — legt de gebruiker
// een mening in de mond die hij nooit had.

import type {
  Carryover,
  ChannelIntent,
  ChannelUnit,
  ColumnRole,
  DatasetVersion,
  KpiType,
  MediaShare,
  ModelIntent,
  SaturationBelief,
  SeasonalityBelief,
  Strength,
} from "@/lib/types";

export interface BeliefOption<T> {
  value: T;
  label: string;
  /** Eén regel die de keuze verankert in iets herkenbaars. */
  hint?: string;
}

export interface ChannelQuestion<T> {
  id: "carryover" | "strength" | "saturation";
  /** De vraag, met de kanaalnaam erin — concreet, niet abstract. */
  ask: (channel: string) => string;
  options: BeliefOption<T>[];
}

export const CARRYOVER_QUESTION: ChannelQuestion<Carryover> = {
  id: "carryover",
  ask: (channel) => `Werkt ${channel} nog door nadat je stopt?`,
  options: [
    { value: "none", label: "Nee, alleen die week zelf", hint: "Typisch voor zoeken op je merknaam." },
    { value: "short", label: "Een weekje", hint: "Zoekadvertenties, retargeting." },
    { value: "medium", label: "Een paar weken", hint: "Social, video." },
    { value: "long", label: "Meer dan een maand", hint: "Tv, radio, buitenreclame." },
    { value: "unknown", label: "Weet ik niet", hint: "Dan laat ik je data het bepalen." },
  ],
};

export const STRENGTH_QUESTION: ChannelQuestion<Strength> = {
  id: "strength",
  ask: (channel) => `Hoeveel verwacht je van ${channel}, vergeleken met je andere kanalen?`,
  options: [
    { value: "small", label: "Minder dan de andere" },
    { value: "moderate", label: "Ongeveer gemiddeld" },
    { value: "large", label: "Meer dan de andere" },
    { value: "unknown", label: "Weet ik niet", hint: "Dan laat ik je data het bepalen." },
  ],
};

export const SATURATION_QUESTION: ChannelQuestion<SaturationBelief> = {
  id: "saturation",
  ask: (channel) => `Als je morgen het dubbele in ${channel} stopt — levert dat ook ongeveer het dubbele op?`,
  options: [
    { value: "far_from_saturated", label: "Ja, daar zit nog rek in" },
    { value: "approaching", label: "Deels, het begint af te vlakken" },
    { value: "likely_saturated", label: "Nee, dit kanaal zit vol" },
    { value: "unknown", label: "Weet ik niet", hint: "Dan laat ik je data het bepalen." },
  ],
};

export const CHANNEL_QUESTIONS = [CARRYOVER_QUESTION, STRENGTH_QUESTION, SATURATION_QUESTION] as const;

export const SEASONALITY_QUESTION = {
  id: "seasonality" as const,
  ask: "Beweegt je resultaat met het seizoen mee, los van je marketing?",
  options: [
    { value: "none", label: "Nauwelijks" },
    { value: "mild", label: "Een beetje" },
    { value: "strong", label: "Sterk", hint: "Bijvoorbeeld een duidelijke kerst- of zomerpiek." },
    { value: "unknown", label: "Weet ik niet" },
  ] as BeliefOption<SeasonalityBelief>[],
};

export const MEDIA_SHARE_QUESTION = {
  id: "media_share" as const,
  ask: "Welk deel van je resultaat denk je dat marketing als geheel drijft?",
  options: [
    { value: "small", label: "Een klein deel", hint: "Ongeveer 15% — een gevestigde naam waar reclame bovenop komt." },
    { value: "moderate", label: "Ongeveer een derde", hint: "Ongeveer 30% — het meest voorkomende geval." },
    { value: "large", label: "Ongeveer de helft", hint: "Ongeveer 50%." },
    { value: "dominant", label: "Het grootste deel", hint: "Ongeveer 70% — vrijwel alles komt uit campagnes." },
  ] as BeliefOption<MediaShare>[],
};

export interface ChannelAnswers {
  carryover?: Carryover;
  strength?: Strength;
  saturation?: SaturationBelief;
}

export interface BeliefAnswers {
  channels: Record<string, ChannelAnswers>;
  seasonality?: SeasonalityBelief;
  /** Afwezig is een geldig antwoord: de rekenkern gebruikt dan zijn eigen middenwaarde. */
  media_share?: MediaShare;
  /** Vrije tekst over het bedrijf. Optioneel — de stap is ook zonder af te ronden. */
  context?: string;
}

function byRole(dataset: DatasetVersion, role: ColumnRole): string[] {
  const roles = dataset.column_roles ?? {};
  return Object.entries(roles)
    .filter(([, r]) => r === role)
    .map(([name]) => name);
}

/** De kanalen waarover stap 5 vragen stelt, met de eenheid die in stap 3 is bevestigd. */
export function channelsOf(dataset: DatasetVersion): { name: string; unit: ChannelUnit }[] {
  const units = dataset.column_units ?? {};
  return byRole(dataset, "spend").map((name) => ({
    name,
    // Stap 3 heeft de eenheid al vastgelegd; hier wordt er niet opnieuw naar gevraagd.
    // "currency" is de terugval, niet de aanname: een kolom zonder eenheid is in stap 3
    // niet als kanaal aangewezen.
    unit: units[name] ?? "currency",
  }));
}

/**
 * Bouw de modelintentie uit de antwoorden.
 *
 * Het KPI-type komt uit stap 1 — daarom wordt het daar gevraagd. Het bepaalt de rekenwijze
 * (een bedrag of hele eenheden), en dat is geen statistische keuze maar een feit over wat de
 * gebruiker meet.
 */
export function buildIntent(
  dataset: DatasetVersion,
  kpiType: KpiType,
  answers: BeliefAnswers,
): ModelIntent {
  const channels: ChannelIntent[] = channelsOf(dataset).map(({ name, unit }) => {
    const given = answers.channels[name] ?? {};
    return {
      name,
      unit,
      // Onbeantwoord is hetzelfde als "weet ik niet" — en dat is een echt antwoord, geen
      // ontbrekende waarde die later stil een middenwaarde wordt.
      carryover: given.carryover ?? "unknown",
      strength: given.strength ?? "unknown",
      saturation: given.saturation ?? "unknown",
      role: "mixed",
    };
  });

  return {
    kpi: byRole(dataset, "kpi")[0] ?? "",
    kpi_type: kpiType,
    channels,
    control_columns: byRole(dataset, "control"),
    seasonality: answers.seasonality ?? "unknown",
    // Een langzame drift zit in bijna elke reeks en kost het model weinig om te schatten;
    // een structurele knik is een uitspraak die je moet weten, dus die blijft uit tenzij
    // iemand het zegt. Dat is dezelfde keuze als de oude sjabloon-intentie maakte.
    expect_trend: true,
    expect_structural_break: false,
    ...(answers.media_share ? { media_share_belief: answers.media_share } : {}),
    ...(answers.context ? { notes: [answers.context] } : {}),
  };
}

const CARRYOVER_WORD: Record<Carryover, string> = {
  none: "zelfde week",
  short: "een week",
  medium: "een paar weken",
  long: "meer dan een maand",
  unknown: "onbekend",
};

const UNIT_WORD: Record<ChannelUnit, string> = {
  currency: "euro's",
  impressions: "vertoningen",
  grp: "GRP's",
  clicks: "clicks",
  sendings: "verzendingen",
};

/**
 * Wat er berekend gaat worden, in mensentaal — het overzicht van stap 6.
 *
 * Bewust zonder enig afgeleid getal: de priors bestaan op dit moment nog niet (de worker
 * leidt ze af) en ze hier alsnog noemen zou een tweede, afwijkende berekening betekenen.
 */
export function describeIntent(intent: ModelIntent): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: "Je resultaat", value: intent.kpi },
    {
      label: `Kanalen (${intent.channels.length})`,
      value: intent.channels
        .map((c) => `${c.name} (${UNIT_WORD[c.unit]})`)
        .join(", "),
    },
  ];

  const known = intent.channels.filter((c) => c.carryover && c.carryover !== "unknown");
  rows.push({
    label: "Na-ijl die je hebt aangegeven",
    value: known.length
      ? known.map((c) => `${c.name}: ${CARRYOVER_WORD[c.carryover!]}`).join(", ")
      : "niets aangegeven — je data bepaalt het",
  });

  if (intent.control_columns?.length) {
    rows.push({ label: "Verklaart mee", value: intent.control_columns.join(", ") });
  }
  rows.push({
    label: "Seizoen",
    value:
      intent.seasonality && intent.seasonality !== "unknown"
        ? { none: "nauwelijks", mild: "een beetje", strong: "sterk" }[intent.seasonality]
        : "onbekend — je data bepaalt het",
  });
  rows.push({
    label: "Aandeel van marketing",
    value: intent.media_share_belief
      ? { small: "een klein deel", moderate: "ongeveer een derde", large: "ongeveer de helft", dominant: "het grootste deel" }[
          intent.media_share_belief
        ]
      : "niet aangegeven — ik reken met het meest voorkomende geval",
  });
  return rows;
}
