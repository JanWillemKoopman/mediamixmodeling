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

/**
 * 209 weken mediabestedingen en omzet uit de voorbeelddataset, elk genormaliseerd op het
 * eigen maximum (0–1). Dit is het beeldmateriaal van de pagina: geen stockfoto maar de
 * werkelijkheid waarin het effect van media verstopt zit — vier jaar aan weken, waarin je
 * met het blote oog wel de pieken ziet, maar niet wat ze veroorzaakt heeft.
 */
export const WEEKLY_SPEND: number[] = [
  0.371, 0.324, 0.328, 0.338, 0.405, 0.355, 0.323, 0.33, 0.316, 0.37, 0.333, 0.361, 0.353,
  0.403, 0.338, 0.336, 0.323, 0.369, 0.323, 0.319, 0.321, 0.324, 0.253, 0.217, 0.226, 0.219,
  0.223, 0.237, 0.202, 0.244, 0.204, 0.227, 0.332, 0.338, 0.363, 0.324, 0.303, 0.735, 0.752,
  0.67, 0.726, 0.706, 0.745, 0.666, 0.674, 0.646, 1.0, 0.732, 0.673, 0.748, 0.526, 0.345, 0.34,
  0.349, 0.344, 0.337, 0.342, 0.325, 0.335, 0.374, 0.33, 0.319, 0.362, 0.363, 0.327, 0.385,
  0.333, 0.304, 0.352, 0.33, 0.312, 0.323, 0.323, 0.299, 0.257, 0.236, 0.212, 0.217, 0.203,
  0.19, 0.217, 0.235, 0.23, 0.246, 0.342, 0.333, 0.32, 0.324, 0.313, 0.662, 0.689, 0.693, 0.646,
  0.694, 0.775, 0.716, 0.749, 0.658, 0.655, 0.954, 0.707, 0.718, 0.502, 0.38, 0.314, 0.384,
  0.345, 0.364, 0.299, 0.328, 0.368, 0.346, 0.335, 0.373, 0.327, 0.318, 0.291, 0.375, 0.331,
  0.322, 0.379, 0.375, 0.382, 0.325, 0.362, 0.319, 0.233, 0.225, 0.216, 0.231, 0.239, 0.201,
  0.24, 0.26, 0.188, 0.214, 0.296, 0.335, 0.308, 0.331, 0.327, 0.661, 0.727, 0.673, 0.745,
  0.657, 0.743, 0.707, 0.733, 0.681, 0.744, 0.955, 0.67, 0.762, 0.706, 0.322, 0.312, 0.373,
  0.327, 0.305, 0.307, 0.316, 0.312, 0.326, 0.391, 0.371, 0.339, 0.315, 0.333, 0.336, 0.36,
  0.329, 0.322, 0.345, 0.335, 0.312, 0.336, 0.345, 0.291, 0.28, 0.22, 0.21, 0.26, 0.205, 0.249,
  0.225, 0.221, 0.241, 0.373, 0.348, 0.339, 0.341, 0.322, 0.487, 0.755, 0.736, 0.753, 0.72,
  0.727, 0.703, 0.67, 0.657, 0.674, 0.964, 0.639, 0.69, 0.686, 0.36, 0.381,
];

export const WEEKLY_RESULT: number[] = [
  0.528, 0.529, 0.524, 0.512, 0.509, 0.51, 0.497, 0.478, 0.444, 0.453, 0.436, 0.443, 0.42,
  0.414, 0.406, 0.398, 0.405, 0.386, 0.398, 0.386, 0.406, 0.39, 0.372, 0.33, 0.324, 0.332,
  0.338, 0.339, 0.302, 0.323, 0.328, 0.366, 0.405, 0.414, 0.411, 0.406, 0.419, 0.516, 0.556,
  0.564, 0.602, 0.641, 0.672, 0.663, 0.681, 0.659, 0.878, 0.738, 0.769, 0.736, 0.75, 0.632,
  0.581, 0.557, 0.554, 0.539, 0.545, 0.515, 0.498, 0.488, 0.461, 0.448, 0.463, 0.459, 0.42,
  0.449, 0.444, 0.404, 0.404, 0.419, 0.392, 0.398, 0.403, 0.362, 0.37, 0.328, 0.359, 0.38,
  0.309, 0.343, 0.353, 0.342, 0.377, 0.367, 0.406, 0.426, 0.441, 0.435, 0.466, 0.535, 0.557,
  0.602, 0.596, 0.619, 0.639, 0.688, 0.694, 0.684, 0.68, 0.971, 0.785, 0.763, 0.751, 0.638,
  0.593, 0.594, 0.563, 0.561, 0.548, 0.53, 0.508, 0.519, 0.508, 0.488, 0.474, 0.442, 0.449,
  0.457, 0.427, 0.437, 0.436, 0.428, 0.448, 0.428, 0.419, 0.384, 0.39, 0.38, 0.378, 0.363,
  0.369, 0.357, 0.383, 0.395, 0.363, 0.36, 0.4, 0.417, 0.424, 0.441, 0.475, 0.536, 0.557, 0.589,
  0.814, 0.662, 0.67, 0.697, 0.708, 0.71, 0.713, 1.0, 0.799, 0.802, 0.749, 0.676, 0.594, 0.591,
  0.555, 0.554, 0.543, 0.535, 0.508, 0.511, 0.527, 0.471, 0.506, 0.474, 0.477, 0.486, 0.466,
  0.466, 0.478, 0.431, 0.441, 0.43, 0.441, 0.408, 0.38, 0.391, 0.416, 0.392, 0.381, 0.359,
  0.393, 0.392, 0.39, 0.4, 0.427, 0.439, 0.465, 0.481, 0.484, 0.537, 0.563, 0.6, 0.638, 0.689,
  0.681, 0.709, 0.717, 0.716, 0.726, 0.992, 0.815, 0.772, 0.773, 0.651, 0.658,
];

/** De 26 weken meetperiode uit de voorbeeldcase: het staartstuk van de reeks. */
export const MEASUREMENT_WINDOW = 26;
