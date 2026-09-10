// Alle cijfers op de site komen hier vandaan, op één plek, zodat in één oogopslag te
// controleren is wát er beweerd wordt. Ze zijn afgeleid uit de synthetische demodataset in
// `demo_data/` en zijn dus *voorbeelddata*: ze staan op de site altijd zichtbaar gelabeld als
// illustratie en worden nergens als klantresultaat of voorspelling gepresenteerd.

export const EXAMPLE_LABEL = "Illustratief voorbeeld";
export const EXAMPLE_LABEL_LONG = "Illustratief voorbeeld — geen klantdata";

/** Totaal mediabudget van het voorbeeldbedrijf, in euro's. */
export const TOTAL_BUDGET = 7_500_000;

/** Omvang van de voorbeeldanalyse. */
export const EXAMPLE_SCOPE = {
  budget: "€ 7,5 mln",
  weeks: 209,
  weeksLabel: "209 weken",
  years: "2022 – 2026",
  channels: 7,
  groups: 5,
};

/**
 * De mediamix zoals hij binnenkomt: zeven kanalen. Voor de analyse worden ze samengevat tot
 * vijf groepen (hieronder), zodat elke groep genoeg weken met variatie heeft om iets over te
 * kunnen zeggen.
 */
export const MEDIA_INPUTS = ["Search", "Shopping", "Social", "TV", "Radio", "YouTube", "Display"];

export interface Channel {
  key: string;
  label: string;
  /** Aandeel in het mediabudget, in procenten. Telt op tot 100. */
  spendShare: number;
  /** Besteding in euro's. */
  spend: number;
  /** Geschat aandeel in de door media verklaarde omzet, in procenten. Telt op tot 100. */
  effectShare: number;
  /** Onder- en bovengrens van de bandbreedte rond die schatting. */
  low: number;
  high: number;
}

// Vaste volgorde: overal dezelfde groepen in dezelfde volgorde.
export const CHANNELS: Channel[] = [
  { key: "shopping", label: "Shopping", spendShare: 38, spend: 2_850_000, effectShare: 26, low: 19, high: 33 },
  { key: "search", label: "Search", spendShare: 28, spend: 2_100_000, effectShare: 19, low: 13, high: 25 },
  { key: "tv", label: "TV", spendShare: 12, spend: 900_000, effectShare: 24, low: 16, high: 32 },
  { key: "social", label: "Social", spendShare: 12, spend: 900_000, effectShare: 15, low: 10, high: 20 },
  { key: "radio", label: "Radio & overig", spendShare: 10, spend: 750_000, effectShare: 16, low: 9, high: 23 },
];

// Bestedingen zijn neutraal grijs, geschatte bijdrage is groen — behalve waar de bijdrage
// achterblijft bij de besteding, dan violet. Meer kleuren gebruikt de site niet.
export const SPEND_STEPS = ["#3A3A40", "#5A5A62", "#7B7B84", "#9E9EA6", "#C4C4CA"] as const;
export const EFFECT_STEPS = ["#24803F", "#2E9E50", "#4FB16C", "#7BC793", "#A8DCB8"] as const;

/**
 * Wat de systemen elk apart rapporteren. Allemaal waar, geen twee vergelijkbaar, en niet bij
 * elkaar op te tellen omdat ze deels hetzelfde resultaat aan zichzelf toeschrijven.
 */
export interface PlatformReport {
  source: string;
  scope: string;
  metrics: { label: string; value: string }[];
}

export const PLATFORM_REPORTS: PlatformReport[] = [
  {
    source: "Google Ads",
    scope: "wat er binnen Google gebeurt",
    metrics: [
      { label: "Conversies", value: "12.842" },
      { label: "CPA", value: "€ 42" },
      { label: "ROAS", value: "4,2" },
    ],
  },
  {
    source: "Meta",
    scope: "wat Meta kan toeschrijven",
    metrics: [
      { label: "Conversies", value: "8.421" },
      { label: "CPA", value: "€ 48" },
      { label: "ROAS", value: "3,8" },
    ],
  },
  {
    source: "TV",
    scope: "bereik in de doelgroep",
    metrics: [
      { label: "GRP", value: "1.240" },
      { label: "Bereik", value: "+12%" },
    ],
  },
  {
    source: "CRM",
    scope: "klanten en orders",
    metrics: [{ label: "Orders", value: "92.700" }],
  },
];

/** De klantreis uit hoofdstuk 3: zichtbaar én onzichtbaar. */
export const JOURNEY = [
  { label: "YouTube-video", note: "maandag" },
  { label: "Zoekopdracht", note: "dinsdag" },
  { label: "Social-advertentie", note: "volgende week" },
  { label: "Aankoop in de winkel", note: "twee weken later" },
];

/** Waar de meting van die reis in de praktijk onderbreekt. */
export const TRACKING_GAPS = ["cookie", "consent", "cross-device", "offline"];

/** Wat het model naast media meeweegt. */
export const MODEL_DRIVERS = [
  { key: "media", label: "Mediabestedingen", note: "per kanaal, per week" },
  { key: "promo", label: "Promoties", note: "acties en kortingen" },
  { key: "price", label: "Prijs", note: "eigen prijs en prijsindex" },
  { key: "season", label: "Seizoen", note: "feestdagen en weer" },
  { key: "trend", label: "Trend", note: "markt en economie" },
];

/**
 * Illustratief scenario: verschuif budget van Shopping en Search naar TV en radio. Het effect
 * vlakt af naarmate je verder verschuift en de bandbreedte wordt breder — precies zoals een
 * eerlijke schatting hoort te doen: die verdeling heeft het model nooit gezien.
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

/** Wie levert de verschuiving en wie ontvangt hem — beide kanten tellen op tot 1. */
const GIVE: Record<string, number> = { shopping: 0.53, search: 0.47 };
const TAKE: Record<string, number> = { tv: 0.59, radio: 0.41 };

/** De besteding per groep ná de verschuiving, in euro's. */
export function shiftedSpend(shiftPct: number): number[] {
  const moved = (TOTAL_BUDGET * shiftPct) / 100;
  return CHANNELS.map((c) => c.spend - (GIVE[c.key] ?? 0) * moved + (TAKE[c.key] ?? 0) * moved);
}

/**
 * Wekelijkse reeks voor de modelgrafiek: het resultaat, het deel dat aan media wordt
 * toegeschreven en de bandbreedte daaromheen, plus de weken waarin een promotie liep.
 * Deterministisch (geen random), zodat server en browser exact hetzelfde renderen.
 */
export interface WeekPoint {
  week: number;
  result: number;
  media: number;
  mediaLow: number;
  mediaHigh: number;
  promo: boolean;
}

export function weeklySeries(weeks = EXAMPLE_SCOPE.weeks): WeekPoint[] {
  const points: WeekPoint[] = [];
  for (let i = 0; i < weeks; i++) {
    const t = i / weeks;
    const season = 12 * Math.sin((i / 52) * Math.PI * 2 - 1.1);
    const peak = 18 * Math.exp(-Math.pow((i % 52) - 47, 2) / 5); // eindejaarspiek
    const promoWeek = i % 26 === 12 || i % 26 === 13;
    const promo = promoWeek ? 9 : 0;
    const trend = 7 * t;
    const wobble = 2.6 * Math.sin(i * 0.9) + 1.8 * Math.sin(i * 0.37);
    const result = 100 + season + peak + promo + trend + wobble;
    const share = 0.27 + 0.05 * Math.sin(i * 0.21) + 0.03 * Math.sin(i * 0.06);
    const media = result * share;
    const band = media * (0.22 + 0.04 * Math.sin(i * 0.13));
    points.push({ week: i + 1, result, media, mediaLow: media - band, mediaHigh: media + band, promo: promoWeek });
  }
  return points;
}
