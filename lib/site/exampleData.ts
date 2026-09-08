// Alle cijfers op de marketingpagina komen hier vandaan, op één plek, zodat in één
// oogopslag te controleren is wát er beweerd wordt. Ze zijn afgeleid uit de synthetische
// demodataset in `demo_data/` (209 weken, ±€30 mln mediabudget) en zijn dus *voorbeelddata*:
// ze staan op de pagina altijd zichtbaar gelabeld als illustratie en worden nergens als
// klantresultaat gepresenteerd. Zie ook docs/one-page-website-plan.md §4 (claimregels).

export const EXAMPLE_LABEL = "Voorbeelddata — ter illustratie";

export interface Channel {
  key: string;
  /** Korte naam, ook gebruikt in de legenda. */
  label: string;
  /** Aandeel in het mediabudget, in procenten. Telt op tot 100. */
  spendShare: number;
  /** Geschat aandeel in de door media verklaarde omzet, in procenten. Telt op tot 100. */
  effectShare: number;
  /** Onder- en bovengrens van de bandbreedte rond `effectShare`. */
  effectLow: number;
  effectHigh: number;
}

// Vaste volgorde: overal op de pagina dezelfde kanalen in dezelfde volgorde, zodat de
// bezoeker de kleurcode één keer leert en daarna elke visualisatie zonder legenda begrijpt.
export const CHANNELS: Channel[] = [
  { key: "shopping", label: "Shopping", spendShare: 37.8, effectShare: 26, effectLow: 19, effectHigh: 33 },
  { key: "search", label: "Search", spendShare: 28.3, effectShare: 19, effectLow: 13, effectHigh: 25 },
  { key: "tv", label: "TV", spendShare: 12.2, effectShare: 24, effectLow: 16, effectHigh: 32 },
  { key: "social", label: "Social", spendShare: 11.7, effectShare: 15, effectLow: 10, effectHigh: 20 },
  { key: "radio", label: "Radio & overig", spendShare: 10.0, effectShare: 16, effectLow: 9, effectHigh: 23 },
];

// Twee ramps van vijf stappen: bestedingen zijn neutraal, effect is blauw — dat is de
// kleurregel die het hele verhaal draagt. De stappen zijn gecontroleerd op onderling
// onderscheid (ook bij kleurenblindheid); identiteit hangt bovendien nooit alleen aan
// kleur: elk segment heeft een label, een 2px-tussenruimte en een tekstequivalent.
export const SPEND_STEPS = ["#252A32", "#4E545E", "#7F858F", "#ADB3BB", "#E1E4E8"] as const;
export const EFFECT_STEPS = ["#04213F", "#0F5099", "#3B8AD6", "#86BAEE", "#CBE3FA"] as const;
/** Bij welke stappen de tekst ín het segment licht moet zijn. */
export const STEP_ON_DARK = [true, true, false, false, false] as const;

/** Wat de advertentieplatforms samen rapporteren versus wat het bedrijf zelf registreerde. */
export const REPORTING_GAP = {
  reported: 128400,
  reportedLabel: "conversies, opgeteld uit alle platformrapportages",
  actual: 92700,
  actualLabel: "orders, geregistreerd in het ordersysteem",
  periodLabel: "zelfde periode, zelfde bedrijf",
};

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
  fromLabel: "shopping en merk-search",
  toLabel: "TV en radio",
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

/** De budgetverdeling ná de verschuiving, voor de scenario-vergelijking in "van inzicht naar beslissing". */
export function shiftedSpendShares(shiftPct: number): number[] {
  const give = [0.6, 0.4, 0, 0, 0]; // shopping levert 60% van de verschuiving, search 40%
  const take = [0, 0, 0.65, 0, 0.35]; // TV neemt 65%, radio & overig 35%
  return CHANNELS.map((c, i) => c.spendShare - give[i] * shiftPct + take[i] * shiftPct);
}

/**
 * Voorbeeldcase. Nadrukkelijk géén klantresultaat: samengesteld uit de voorbeelddataset om
 * te laten zien hoe een analyse tot een besluit leidt. Zodra er een echte case beschikbaar
 * is, vervangt die dit blok één-op-één.
 */
export const EXAMPLE_CASE = {
  profile: "Landelijke retailer, online en winkels",
  budget: "€ 7,5 mln mediabudget per jaar",
  channels: "7 kanalen",
  history: "209 weken (4 jaar) wekelijkse data",
  findings: [
    {
      title: "TV droeg naar schatting ongeveer twee keer zoveel bij als het budgetaandeel suggereerde",
      body: "TV kreeg 12% van het budget en hangt in de analyse samen met circa een kwart van de door media verklaarde omzet — een effect dat pas zichtbaar wordt als je weken en kanalen in samenhang bekijkt.",
    },
    {
      title: "Merk-search bleek vooral vraag op te vangen die er al was",
      body: "De campagne rapporteerde een hoge ROAS, maar in de analyse verandert het resultaat nauwelijks mee met het budget van dit kanaal.",
    },
    {
      title: "Prijs en promoties verklaarden een groter deel van de pieken dan media",
      body: "Zonder die factoren in het model zou het effect van media stelselmatig te hoog zijn ingeschat.",
    },
  ],
  decision:
    "In het volgende mediaplan is 12% van het budget verschoven van shopping en merk-search naar TV en radio, met een vooraf afgesproken meetperiode van 26 weken om de aanname te toetsen.",
  outcome:
    "Het geschatte effect van die verschuiving lag tussen +0,8% en +4,2% omzet bij een gelijkblijvend totaalbudget — inclusief de mogelijkheid dat het effect klein blijft.",
};

/** Feiten over de werkwijze. Verifieerbaar, geen belofte. */
export const METHOD_FACTS = [
  {
    value: "2+ jaar",
    label: "wekelijkse historie als basis",
    body: "Effecten van media zijn pas te scheiden van seizoen, prijs en promoties als je genoeg weken hebt gezien.",
  },
  {
    value: "Altijd een marge",
    label: "elk resultaat met bandbreedte",
    body: "Je krijgt geen enkel getal zonder het bereik waarbinnen het waarschijnlijk ligt. Ook als dat bereik ongemakkelijk breed is.",
  },
  {
    value: "Mens in de lus",
    label: "elke stap beoordeeld",
    body: "Data, aannames en uitkomsten worden per stap door een analist beoordeeld voordat er iets wordt opgeleverd.",
  },
];
