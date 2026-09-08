// Gestructureerde copy van de site op één plek, zodat de tekst te reviewen is zonder door
// JSX te lezen. Lopende alinea's staan bij de sectie zelf; hier staat alles wat een lijst,
// stap, navigatie-item of vraag is. Toon: helder, concreet, zakelijk — verkoop de uitkomst
// (betere budgetbeslissingen), niet de methode.

export const SITE = {
  wordmark: "media mix modeling",
  ctaPrimary: "Vraag een demo aan",
  ctaSecondary: "Bekijk hoe het werkt",
  tagline: "Van mediabestedingen naar media-effect. Van media-effect naar betere budgetbeslissingen.",
};

/** Hoofdmenu. Kort gehouden: vier ankers, inloggen, één actie. */
export const NAV = [
  { href: "#de-vraag", label: "De vraag" },
  { href: "#aanpak", label: "Aanpak" },
  { href: "#voorbeeld", label: "Voorbeeld" },
  { href: "#methode", label: "Methode" },
];

/** Van rapportage naar inzicht — de twee kolommen van de verschuivingssectie. */
export const SHIFT = {
  old: {
    label: "Campagnerapportage",
    caption: "Elk kanaal beoordeelt zichzelf",
    items: ["ROAS per platform", "CPA per campagne", "Clicks en conversies", "Bereik en impressies", "Zeven verschillende waarheden"],
  },
  next: {
    label: "Geïntegreerd media-effect",
    caption: "Alle kanalen op één maatstaf",
    items: ["Geschatte bijdrage per kanaal", "Bandbreedte rond elke schatting", "Scenario's naast elkaar", "Eén beeld over alle weken", "Een besluit dat je kunt uitleggen"],
  },
};

/** De vier stappen van de methode: data → analyse → inzicht → beslissing. */
export const METHOD_STEPS = [
  {
    number: "01",
    title: "Data",
    body: "Mediabestedingen, je eigen resultaatcijfers en de factoren die er verder toe doen: prijs, promoties, seizoen, marktomstandigheden. Wekelijks, over meerdere jaren.",
    note: "Wat we nodig hebben, heb je meestal al.",
  },
  {
    number: "02",
    title: "Analyse",
    body: "Het model schat de samenhang tussen bestedingen, resultaat en die andere factoren — over alle kanalen en alle weken tegelijk, inclusief na-ijleffecten.",
    note: "Media Mix Modeling is de methode.",
  },
  {
    number: "03",
    title: "Inzicht",
    body: "De geschatte bijdrage van elk kanaal wordt zichtbaar, met de bandbreedte eromheen. Inclusief wat de analyse níét kan aantonen.",
    note: "Geen enkel getal zonder marge.",
  },
  {
    number: "04",
    title: "Beslissing",
    body: "Je beoordeelt alternatieve budgetverdelingen met dit inzicht ernaast en legt vast welke aanname je de komende periode toetst.",
    note: "Hier begint de waarde.",
  },
];

/** Drie principes rond onzekerheid. Een vertrouwenskenmerk, geen zwakte. */
export const TRUST_PRINCIPLES = [
  {
    number: "01",
    title: "Meerdere jaren data",
    body: "Media-effect is pas te scheiden van seizoen, prijs en promotie als je genoeg weken hebt gezien. Daarom werken we met jaren, niet met campagnes.",
  },
  {
    number: "02",
    title: "Altijd een bandbreedte",
    body: "Elk resultaat komt met het bereik waarbinnen het waarschijnlijk ligt. Ook als dat bereik ongemakkelijk breed is.",
  },
  {
    number: "03",
    title: "Menselijke interpretatie",
    body: "Data, aannames en uitkomsten worden per stap door een analist beoordeeld. Een model levert schattingen, geen besluiten.",
  },
];

/** Wat een echte klantcase straks laat zien. Nu nog leeg: we verzinnen geen resultaten. */
export const PROOF_SLOTS = [
  { label: "Sector & profiel", body: "Het type bedrijf en de markt waarin het opereert." },
  { label: "Mediabudget", body: "De orde van grootte van het jaarlijkse mediabudget." },
  { label: "Kanalen & historie", body: "Hoeveel kanalen zijn meegenomen en over hoeveel weken." },
  { label: "Belangrijkste inzicht", body: "Wat de analyse liet zien dat de rapportages niet lieten zien." },
  { label: "Budgetbeslissing", body: "Welke verschuiving er is doorgevoerd, en op welke aanname." },
  { label: "Wat er daarna gemeten is", body: "Het waargenomen resultaat in de afgesproken meetperiode." },
];

/** Voor wie dit relevant is — staat vlak voor het formulier. */
export const FIT_CRITERIA = [
  "Je bent verantwoordelijk voor een substantieel mediabudget.",
  "Je werkt met meerdere mediakanalen naast elkaar.",
  "Je hebt historische data over bestedingen en resultaat.",
];

/** Voettekst: drie kolommen plus de juridische regel. */
export const FOOTER_NAV = [
  {
    title: "Product",
    links: [
      { href: "#aanpak", label: "Hoe het werkt" },
      { href: "#voorbeeld", label: "Voorbeeldanalyse" },
      { href: "/login", label: "Inloggen" },
    ],
  },
  {
    title: "Inzicht",
    links: [
      { href: "#de-vraag", label: "De vraag" },
      { href: "#media-effect", label: "Media-effect" },
      { href: "#beslissingen", label: "Budgetbeslissingen" },
    ],
  },
  {
    title: "Bedrijf",
    links: [
      { href: "#methode", label: "Methode" },
      { href: "#demo", label: "Contact" },
    ],
  },
];
