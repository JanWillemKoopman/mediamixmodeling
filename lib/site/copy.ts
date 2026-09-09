// Alle copy van de site op één plek, zodat de tekst te reviewen is zonder door JSX te lezen.
// De site is één doorlopend verhaal in negen hoofdstukken; lopende alinea's staan bij de
// sectie zelf, alles wat een lijst of stap is staat hier. Toon: uitleggend, zakelijk, zonder
// marketingtaal — een CMO leest liever een goede uitleg dan een belofte.

export const SITE = {
  wordmark: "media mix modeling",
  ctaPrimary: "Vraag een demo aan",
  ctaSecondary: "Bekijk een voorbeeldanalyse",
  taglineTop: "Van mediabestedingen naar inzicht.",
  taglineBottom: "Van inzicht naar betere budgetbeslissingen.",
};

/** Hoofdmenu: vier ankers die het verhaal volgen. */
export const NAV = [
  { href: "#meten", label: "De vraag" },
  { href: "#perspectief", label: "Perspectief" },
  { href: "#inzichten", label: "Wat het oplevert" },
  { href: "#werkwijze", label: "Zo werkt het" },
];

/** Hoofdstuk 6 — wat de analyse uiteindelijk oplevert, als vijf onderdelen van één verhaal. */
export const OUTCOMES = [
  {
    number: "01",
    title: "Je mediabijdrage",
    body: "Welke mediakanalen dragen naar schatting bij aan je bedrijfsresultaat, en hoe verhoudt die bijdrage zich tot wat je erin investeert?",
  },
  {
    number: "02",
    title: "De invloed van andere factoren",
    body: "Welke ontwikkelingen in je resultaat hangen samen met promoties, prijs, seizoen en trend — en horen dus niet bij media?",
  },
  {
    number: "03",
    title: "Verzadiging",
    body: "Waar levert extra mediabudget mogelijk steeds minder extra resultaat op? Meer budget betekent niet automatisch een evenredig groter effect.",
  },
  {
    number: "04",
    title: "Budgetscenario's",
    body: "Wat kan er volgens het model gebeuren wanneer je je mediabudget anders verdeelt over je kanalen?",
  },
  {
    number: "05",
    title: "Onzekerheid",
    body: "Hoe zeker is een geschatte bijdrage? Geen schijnprecisie, maar een bandbreedte waarmee je het resultaat in de juiste context kunt beoordelen.",
  },
];

/** Hoofdstuk 7 — de vijf stappen van data naar besluit. Bewust compact. */
export const PROCESS = [
  {
    number: "01",
    title: "Data verzamelen",
    body: "We combineren je historische mediabestedingen en bedrijfsresultaten met relevante factoren die invloed kunnen hebben op je resultaat.",
    node: "Data",
  },
  {
    number: "02",
    title: "Model bouwen",
    body: "Het model analyseert de ontwikkeling over tijd en brengt de verschillende invloeden samen.",
    node: "Model",
  },
  {
    number: "03",
    title: "Bijdrage schatten",
    body: "Je krijgt inzicht in de geschatte bijdrage van je mediakanalen en de onzekerheid rondom die schattingen.",
    node: "Inzicht",
  },
  {
    number: "04",
    title: "Scenario's vergelijken",
    body: "Vervolgens kun je verschillende budgetverdelingen onderzoeken en zien hoe het verwachte resultaat volgens het model verandert.",
    node: "Scenario",
  },
  {
    number: "05",
    title: "Beslissen",
    body: "De analyse geeft je een onderbouwd vertrekpunt voor je volgende mediaplan.",
    node: "Beslissing",
  },
];

/** Hoofdstuk 8 — voor wie dit relevant is. */
export const AUDIENCE = [
  "substantieel investeert in marketing en media",
  "meerdere online en offline kanalen gebruikt",
  "over meerdere jaren historische data hebt",
  "al veel marketingrapportages en dashboards hebt",
  "maar nog geen goed beeld hebt van de totale bijdrage van je mediabudget",
  "budgetbeslissingen beter wilt kunnen onderbouwen",
];

/** Voettekst: drie kolommen. */
export const FOOTER_NAV = [
  {
    title: "Het verhaal",
    links: [
      { href: "#meten", label: "De vraag" },
      { href: "#perspectief", label: "Attributie en MMM" },
      { href: "#model", label: "Wat het model doet" },
    ],
  },
  {
    title: "Toepassing",
    links: [
      { href: "#beslissing", label: "Budgetscenario's" },
      { href: "#inzichten", label: "Wat het oplevert" },
      { href: "#werkwijze", label: "Zo werkt het" },
    ],
  },
  {
    title: "Contact",
    links: [
      { href: "#demo", label: "Vraag een demo aan" },
      { href: "/login", label: "Inloggen" },
    ],
  },
];
