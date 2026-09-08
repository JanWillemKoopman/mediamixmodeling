// Alle cijfers op de marketingsite komen hier vandaan, op één plek, zodat in één oogopslag
// te controleren is wát er beweerd wordt. Ze zijn afgeleid uit de synthetische demodataset
// in `demo_data/` (209 weken, meerkanaals mediabudget) en zijn dus *voorbeelddata*: ze
// staan op de site altijd zichtbaar gelabeld als illustratie en worden nergens als
// klantresultaat of voorspelling gepresenteerd.

export const EXAMPLE_LABEL = "Voorbeelddata — ter illustratie";
export const EXAMPLE_LABEL_LONG = "Illustratief voorbeeld — niet gebaseerd op klantdata";

/** Profiel van het voorbeeldbedrijf. Overal op de site hetzelfde bedrijf, dezelfde cijfers. */
export const EXAMPLE_PROFILE = {
  sector: "Landelijke retailer, online en winkels",
  budgetLabel: "€ 7,5 mln",
  budgetSub: "mediabudget per jaar",
  channelsLabel: "7 kanalen",
  channelsSub: "samengevat in 5 groepen",
  historyLabel: "209 weken",
  historySub: "wekelijkse data, 4 jaar",
  variablesLabel: "14 factoren",
  variablesSub: "prijs, promotie, seizoen, markt",
};

export interface Channel {
  key: string;
  /** Korte naam, overal in dezelfde volgorde en dezelfde kleurstap. */
  label: string;
  /** Aandeel in het mediabudget, in procenten. Telt op tot 100. */
  spendShare: number;
  /** Geschat aandeel in de door media verklaarde omzet, in procenten. Telt op tot 100. */
  effectShare: number;
  /** Onder- en bovengrens van de bandbreedte rond `effectShare`. */
  effectLow: number;
  effectHigh: number;
  /** Wat het advertentieplatform (of bureau) zelf over dit kanaal rapporteert. */
  platformMetric: string;
}

// Vaste volgorde: overal dezelfde kanalen in dezelfde volgorde, zodat de bezoeker de
// kleurcode één keer leert en daarna elke visualisatie zonder legenda begrijpt.
export const CHANNELS: Channel[] = [
  { key: "shopping", label: "Shopping", spendShare: 38, effectShare: 26, effectLow: 19, effectHigh: 33, platformMetric: "ROAS 6,1" },
  { key: "search", label: "Search", spendShare: 28, effectShare: 19, effectLow: 13, effectHigh: 25, platformMetric: "CPA € 42" },
  { key: "tv", label: "TV", spendShare: 12, effectShare: 24, effectLow: 16, effectHigh: 32, platformMetric: "1.240 GRP's" },
  { key: "social", label: "Social", spendShare: 12, effectShare: 15, effectLow: 10, effectHigh: 20, platformMetric: "ROAS 3,4" },
  { key: "radio", label: "Radio & overig", spendShare: 10, effectShare: 16, effectLow: 9, effectHigh: 23, platformMetric: "62% bereik" },
];

/** Totaal mediabudget van het voorbeeld, in euro's. */
export const TOTAL_BUDGET = 7_500_000;

/** Besteding per kanaal in euro's, afgeleid van het budgetaandeel. */
export function channelSpend(channel: Channel): number {
  return (TOTAL_BUDGET * channel.spendShare) / 100;
}

// Twee ramps van vijf stappen: bestedingen zijn neutraal-grijs, effect is blauw — dat is de
// kleurregel die het hele verhaal draagt. De stappen zijn gecontroleerd op onderling
// onderscheid (ook bij kleurenblindheid); identiteit hangt bovendien nooit alleen aan
// kleur: elk segment heeft een label, een tussenruimte en een tekstequivalent.
export const SPEND_STEPS = ["#2C3444", "#4E5768", "#77808F", "#A3ABB8", "#CBD1DA"] as const;
export const EFFECT_STEPS = ["#0B2E86", "#1F5AFF", "#4E82FF", "#87A9FF", "#BFD0FF"] as const;
/** Dezelfde blauwe ramp, maar leesbaar op de donkere secties. */
export const EFFECT_STEPS_INK = ["#3D6FFF", "#5B87F5", "#7FA6FF", "#A5C0FF", "#C9D9FF"] as const;
export const SPEND_STEPS_INK = ["#D7DCE6", "#AEB6C4", "#8C95A6", "#6C7588", "#4E5768"] as const;
/** Bij welke stappen de tekst ín het segment licht moet zijn. */
export const STEP_ON_DARK = [true, true, true, false, false] as const;

/**
 * De losse signalen waar een marketingteam elke maandag naar kijkt. Elk systeem rapporteert
 * iets anders, over iets anders, in een andere eenheid — dat is precies het probleem.
 */
export interface PlatformSignal {
  source: string;
  metric: string;
  value: string;
  note: string;
}

export const PLATFORM_SIGNALS: PlatformSignal[] = [
  { source: "Meta", metric: "ROAS", value: "4,2", note: "laatste 28 dagen, eigen attributie" },
  { source: "Google Ads", metric: "CPA", value: "€ 42", note: "laatste 30 dagen, data-driven" },
  { source: "Shopping", metric: "Conversies", value: "12.842", note: "inclusief view-through" },
  { source: "GA4", metric: "Sessies", value: "128.400", note: "last non-direct click" },
  { source: "CRM", metric: "Orders", value: "92.700", note: "daadwerkelijk geregistreerd" },
  { source: "TV-bureau", metric: "GRP's", value: "1.240", note: "doelgroep 25-54" },
  { source: "Radio", metric: "Bereik", value: "62%", note: "weekbereik doelgroep" },
  { source: "YouTube", metric: "Views", value: "3,1 mln", note: "≥ 30 seconden" },
];

/** Wat de platforms samen rapporteren versus wat het bedrijf zelf registreerde. */
export const REPORTING_GAP = {
  reported: 128400,
  reportedLabel: "conversies, opgeteld uit alle platformrapportages",
  actual: 92700,
  actualLabel: "orders, geregistreerd in het eigen ordersysteem",
  periodLabel: "zelfde periode, zelfde bedrijf",
};

/**
 * Wat verklaart het resultaat? Media is één van de verklarende factoren, en niet de
 * grootste — dat eerlijk laten zien is het verschil tussen een analyse en een verkooppraatje.
 * Telt op tot 100%.
 */
export const DECOMPOSITION = [
  { label: "Basisvraag", value: 55, note: "merk, distributie, bestaande klanten", accent: false },
  { label: "Media", value: 26, note: "geschatte bijdrage van alle kanalen samen", accent: true },
  { label: "Prijs & promotie", value: 13, note: "kortingen, acties, prijsniveau", accent: false },
  { label: "Seizoen & markt", value: 6, note: "weer, feestdagen, marktontwikkeling", accent: false },
];

/**
 * Illustratief scenario: verschuif een deel van het budget van kanalen die vooral bestaande
 * vraag opvangen (shopping, merk-search) naar kanalen die vraag creëren (TV, radio).
 * Het geschatte effect vlakt af naarmate je verder verschuift, en de bandbreedte wordt
 * breder — precies zoals een eerlijke schatting hoort te doen.
 */
export const SCENARIO = {
  min: 0,
  max: 20,
  step: 1,
  initial: 12,
  fromLabel: "Shopping & Search",
  toLabel: "TV & Radio",
};

export interface ScenarioEstimate {
  mid: number;
  low: number;
  high: number;
}

export function estimateScenario(shiftPct: number): ScenarioEstimate {
  const s = Math.min(Math.max(shiftPct, SCENARIO.min), SCENARIO.max);
  const mid = 0.3 * s - 0.0075 * s * s;
  const halfWidth = 0.5 + 0.11 * s;
  return { mid, low: mid - halfWidth, high: mid + halfWidth };
}

/** Wie levert de verschuiving en wie ontvangt hem — samen steeds 100%. */
const GIVE = [0.6, 0.4, 0, 0, 0]; // Shopping levert 60% van de verschuiving, Search 40%
const TAKE = [0, 0, 0.65, 0, 0.35]; // TV neemt 65%, Radio & overig 35%

/** De budgetverdeling ná de verschuiving. */
export function shiftedSpendShares(shiftPct: number): number[] {
  return CHANNELS.map((c, i) => c.spendShare - GIVE[i] * shiftPct + TAKE[i] * shiftPct);
}

/**
 * Wekelijkse reeks voor de effectgrafiek: resultaat, het deel dat aan media wordt
 * toegeschreven en de bandbreedte daaromheen. Deterministisch (geen random), zodat server
 * en browser exact hetzelfde renderen. Puur illustratief: het is een gladde reeks met
 * seizoen, promotiepieken en een lichte trend — geen echte klantdata.
 */
export interface WeekPoint {
  week: number;
  /** Genormaliseerd resultaat (index 100 = gemiddelde). */
  result: number;
  /** Geschat deel daarvan dat samenhangt met media. */
  media: number;
  mediaLow: number;
  mediaHigh: number;
}

export function weeklySeries(weeks = 104): WeekPoint[] {
  const points: WeekPoint[] = [];
  for (let i = 0; i < weeks; i++) {
    const t = i / weeks;
    const season = 12 * Math.sin((i / 52) * Math.PI * 2 - 1.1);
    const peak = 16 * Math.exp(-Math.pow((i % 52) - 47, 2) / 6); // eindejaarspiek
    const trend = 6 * t;
    const wobble = 3 * Math.sin(i * 0.9) + 2 * Math.sin(i * 0.37);
    const result = 100 + season + peak + trend + wobble;
    const mediaShare = 0.28 + 0.05 * Math.sin(i * 0.21) + 0.03 * Math.sin(i * 0.06);
    const media = result * mediaShare;
    const band = media * (0.22 + 0.04 * Math.sin(i * 0.13));
    points.push({ week: i + 1, result, media, mediaLow: media - band, mediaHigh: media + band });
  }
  return points;
}

/** De vijf beslissingen die het inzicht mogelijk maakt (sectie "Van inzicht naar beslissing"). */
export interface DecisionItem {
  id: string;
  number: string;
  question: string;
  answer: string;
  /** Welke minivisualisatie bij deze vraag hoort. */
  viz: "contribution" | "headroom" | "scenario" | "compare" | "plan";
  readout: string;
}

export const DECISIONS: DecisionItem[] = [
  {
    id: "bijdrage",
    number: "01",
    question: "Welke mediakanalen dragen naar schatting bij aan ons resultaat?",
    answer:
      "Per kanaal de geschatte bijdrage aan je resultaat, met de bandbreedte eromheen. Je ziet niet alleen wat ertoe lijkt te doen, maar ook hoe zeker dat beeld is.",
    viz: "contribution",
    readout: "Geschatte bijdrage per kanaal",
  },
  {
    id: "ruimte",
    number: "02",
    question: "Waar zit ruimte om budget anders te verdelen?",
    answer:
      "Kanalen waar extra budget naar verwachting weinig toevoegt, komen naast kanalen waar nog ruimte lijkt te zitten. Het startpunt van een verschuiving, geen automatisch besluit.",
    viz: "headroom",
    readout: "Budgetaandeel versus geschatte bijdrage",
  },
  {
    id: "scenario",
    number: "03",
    question: "Wat kan er gebeuren als we onze mediaverdeling veranderen?",
    answer:
      "Je zet je huidige verdeling naast een alternatieve verdeling en ziet het geschatte effect op je resultaat — als bereik, niet als belofte.",
    viz: "scenario",
    readout: "Geschat effect van een verschuiving",
  },
  {
    id: "vergelijken",
    number: "04",
    question: "Hoe verhouden onze kanalen zich tot elkaar?",
    answer:
      "Elk kanaal wordt op dezelfde manier en over dezelfde periode beoordeeld. Daardoor vergelijk je ze op één maatstaf in plaats van op zeven verschillende rapportages.",
    viz: "compare",
    readout: "Eén maatstaf over alle kanalen",
  },
  {
    id: "plan",
    number: "05",
    question: "Hoe onderbouw ik mijn volgende mediaplan?",
    answer:
      "Je legt vast welke aannames onder het plan liggen, wat het geschatte effect is en hoe zeker dat is. Het gesprek gaat weer over keuzes, niet over de betrouwbaarheid van dashboards.",
    viz: "plan",
    readout: "Van aanname naar meetperiode",
  },
];

/** Voorbeeldcase: hoe een analyse tot een besluit leidt. Nadrukkelijk geen klantresultaat. */
export const EXAMPLE_CASE = {
  findings: [
    {
      title: "TV droeg naar schatting meer bij dan het budgetaandeel deed vermoeden",
      body: "TV kreeg 12% van het budget en hangt in de analyse samen met circa een kwart van de door media verklaarde omzet — zichtbaar pas als je weken en kanalen in samenhang bekijkt.",
    },
    {
      title: "Merk-search bleek vooral vraag op te vangen die er al was",
      body: "Het kanaal rapporteerde een hoge ROAS, maar in de analyse verandert het resultaat nauwelijks mee met het budget van dit kanaal.",
    },
    {
      title: "Prijs en promoties verklaarden een groter deel van de pieken dan media",
      body: "Zonder die factoren in het model zou het effect van media stelselmatig te hoog zijn ingeschat.",
    },
  ],
  decision:
    "In het volgende mediaplan verschuift 12% van het budget van Shopping en merk-search naar TV en radio, met een vooraf afgesproken meetperiode van 26 weken om de aanname te toetsen.",
  outcomeLabel: "Geschat effect op omzet bij gelijkblijvend totaalbudget",
  outcomeNote:
    "Bandbreedte, geen voorspelling: de mogelijkheid dat het effect klein blijft, zit er nadrukkelijk in.",
};
