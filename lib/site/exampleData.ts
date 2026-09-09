// Alle cijfers op de marketingsite komen hier vandaan, op één plek, zodat in één oogopslag
// te controleren is wát er beweerd wordt. Ze zijn afgeleid uit de synthetische demodataset
// in `demo_data/` en zijn dus *voorbeelddata*: ze staan op de site altijd zichtbaar gelabeld
// als illustratie en worden nergens als klantresultaat of voorspelling gepresenteerd.

export const EXAMPLE_LABEL = "Illustratief voorbeeld";
export const EXAMPLE_LABEL_LONG = "Illustratief voorbeeld — geen klantdata";

/** Profiel van het voorbeeldbedrijf. Overal op de site hetzelfde bedrijf, dezelfde cijfers. */
export const EXAMPLE_PROFILE = {
  sector: "Landelijke retailer, online en winkels",
  budget: "€ 7,5 mln",
  budgetLabel: "mediabudget per jaar",
  channels: "7",
  channelsLabel: "mediakanalen in de analyse",
  weeks: "209",
  weeksLabel: "weken wekelijkse historie",
  factors: "14",
  factorsLabel: "meegewogen factoren",
};

/** Totaal mediabudget van het voorbeeld, in euro's. */
export const TOTAL_BUDGET = 7_500_000;

export interface Channel {
  key: string;
  label: string;
  /** Mediabesteding per jaar, in euro's. */
  spend: number;
  /** Geschatte bijdrage aan de omzet, in euro's. */
  contribution: number;
  /** Onder- en bovengrens van de bandbreedte rond die schatting. */
  low: number;
  high: number;
  /** Wat het platform of bureau zélf over dit kanaal rapporteert. */
  reported: string;
}

// Vaste volgorde: overal dezelfde kanalen in dezelfde volgorde, zodat de bezoeker de
// leesrichting één keer leert. Bestedingen tellen op tot € 7,5 mln.
export const CHANNELS: Channel[] = [
  { key: "google", label: "Google Ads", spend: 1_800_000, contribution: 2_600_000, low: 2_100_000, high: 3_100_000, reported: "ROAS 6,1" },
  { key: "meta", label: "Meta", spend: 1_200_000, contribution: 1_400_000, low: 1_000_000, high: 1_800_000, reported: "ROAS 4,2" },
  { key: "tv", label: "TV", spend: 2_100_000, contribution: 1_700_000, low: 1_100_000, high: 2_300_000, reported: "1.240 GRP's" },
  { key: "youtube", label: "YouTube", spend: 800_000, contribution: 900_000, low: 600_000, high: 1_200_000, reported: "3,1 mln views" },
  { key: "radio", label: "Radio", spend: 700_000, contribution: 550_000, low: 300_000, high: 800_000, reported: "62% bereik" },
  { key: "display", label: "Display", spend: 500_000, contribution: 300_000, low: 150_000, high: 450_000, reported: "18,4 mln impressies" },
  { key: "ooh", label: "OOH", spend: 400_000, contribution: 250_000, low: 100_000, high: 400_000, reported: "4,2 mln contacten" },
];

/** Geschatte bijdrage per euro besteding. Boven 1,00 draagt een kanaal naar schatting meer
 *  bij dan het kost; daaronder minder. Geen rendement, wel een vergelijkingsmaat. */
export function contributionIndex(channel: Channel): number {
  return channel.contribution / channel.spend;
}

/** Aandeel van een kanaal in het totale budget, in procenten. */
export function spendShare(channel: Channel): number {
  return (channel.spend / TOTAL_BUDGET) * 100;
}

// De datavisualisatie draait op grijswaarden voor bestedingen en groen→violet voor
// geschatte bijdrage. Nooit meer kleuren dan dat: kleur betekent hier iets.
export const SPEND_STEPS = ["#3A3A40", "#55555C", "#6F6F77", "#8A8A92", "#A5A5AC", "#C0C0C6", "#D9D9DE"] as const;
export const EFFECT_STEPS = ["#8511D9", "#9A31E0", "#B053E6", "#7BBE72", "#5EA95B", "#46944B", "#2E9E50"] as const;

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
  { source: "Google Ads", metric: "ROAS", value: "6,1", note: "eigen attributiemodel" },
  { source: "Meta", metric: "ROAS", value: "4,2", note: "28 dagen, view-through" },
  { source: "YouTube", metric: "Views", value: "3,1 mln", note: "≥ 30 seconden" },
  { source: "TV-bureau", metric: "GRP's", value: "1.240", note: "doelgroep 25-54" },
  { source: "Radio", metric: "Bereik", value: "62%", note: "weekbereik doelgroep" },
  { source: "Display", metric: "Impressies", value: "18,4 mln", note: "zichtbaarheid 61%" },
  { source: "GA4", metric: "Sessies", value: "128.400", note: "last non-direct click" },
  { source: "CRM", metric: "Orders", value: "92.700", note: "daadwerkelijk geregistreerd" },
];

/** Wat de platforms samen rapporteren versus wat het bedrijf zelf registreerde. */
export const REPORTING_GAP = {
  reported: 128400,
  reportedLabel: "conversies, opgeteld uit alle platformrapportages",
  actual: 92700,
  actualLabel: "orders, geregistreerd in het eigen ordersysteem",
};

/**
 * Wat verklaart het resultaat? Media is één van de factoren, en niet de grootste — dat
 * eerlijk laten zien is het verschil tussen een analyse en een verkooppraatje.
 */
export const DECOMPOSITION = [
  { label: "Basisvraag", value: 55, note: "merk, distributie, bestaande klanten" },
  { label: "Media", value: 26, note: "alle kanalen samen", accent: true },
  { label: "Prijs & promotie", value: 13, note: "acties en prijsniveau" },
  { label: "Seizoen & markt", value: 6, note: "weer, feestdagen, markt" },
];

/**
 * Illustratief scenario: verschuif budget van kanalen waar de geschatte bijdrage per euro
 * laag is (TV, Display) naar kanalen waar die hoger ligt (Google Ads, YouTube). Het effect
 * vlakt af naarmate je verder verschuift en de bandbreedte wordt breder — precies zoals een
 * eerlijke schatting hoort te doen: het model heeft die situatie nooit gezien.
 */
export const SCENARIO = {
  min: 0,
  max: 20,
  step: 1,
  initial: 12,
  fromLabel: "TV & Display",
  toLabel: "Google Ads & YouTube",
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

/** Wie levert de verschuiving en wie ontvangt hem — beide kanten tellen op tot 1. */
const GIVE: Record<string, number> = { tv: 0.65, display: 0.35 };
const TAKE: Record<string, number> = { google: 0.6, youtube: 0.4 };

/** De besteding per kanaal ná de verschuiving, in euro's. */
export function shiftedSpend(shiftPct: number): number[] {
  const moved = (TOTAL_BUDGET * shiftPct) / 100;
  return CHANNELS.map((c) => c.spend - (GIVE[c.key] ?? 0) * moved + (TAKE[c.key] ?? 0) * moved);
}

/**
 * Wekelijkse reeks voor de effectgrafiek: resultaat, het deel dat aan media wordt
 * toegeschreven en de bandbreedte daaromheen. Deterministisch (geen random), zodat server en
 * browser exact hetzelfde renderen. Puur illustratief.
 */
export interface WeekPoint {
  week: number;
  result: number;
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
    const share = 0.28 + 0.05 * Math.sin(i * 0.21) + 0.03 * Math.sin(i * 0.06);
    const media = result * share;
    const band = media * (0.22 + 0.04 * Math.sin(i * 0.13));
    points.push({ week: i + 1, result, media, mediaLow: media - band, mediaHigh: media + band });
  }
  return points;
}

/** Voorbeeldcase: hoe een analyse tot een besluit leidt. Nadrukkelijk geen klantresultaat. */
export const EXAMPLE_CASE = {
  findings: [
    {
      title: "Twee kanalen kregen samen een derde van het budget",
      body: "TV en Display staan voor € 2,6 mln aan bestedingen. In de analyse hangt daar een geschatte bijdrage van € 2,0 mln mee samen — minder dan wat de kanalen kosten.",
    },
    {
      title: "Search rapporteerde het hoogst en bleef ook in de analyse overeind",
      body: "Google Ads is het enige kanaal waar de platformrapportage en de geschatte bijdrage dezelfde kant op wijzen. Dat maakt het de logische ontvanger van verschoven budget.",
    },
    {
      title: "Prijs en promoties verklaarden een groter deel van de pieken dan media",
      body: "Zonder die factoren in het model zou het effect van media stelselmatig te hoog zijn ingeschat.",
    },
  ],
  decision:
    "In het volgende mediaplan verschuift 12% van het budget van TV en Display naar Google Ads en YouTube, met een vooraf afgesproken meetperiode van 26 weken om de aanname te toetsen.",
};
