// Gestructureerde copy van de site op één plek, zodat de tekst te reviewen is zonder door
// JSX te lezen. Koppen staan als twee regels: de tweede krijgt op de pagina het kleurverloop.
// Toon: kort, concreet, zakelijk — verkoop de uitkomst (betere budgetbeslissingen), niet de
// methode.

export const SITE = {
  wordmark: "media mix modeling",
  ctaPrimary: "Vraag een demo aan",
  ctaSecondary: "Bekijk een voorbeeldanalyse",
  tagline: "Van mediabestedingen naar media-effect. Van media-effect naar betere budgetbeslissingen.",
};

/** Hoofdmenu. Vier ankers, verder niets. */
export const NAV = [
  { href: "#vraag", label: "De vraag" },
  { href: "#effect", label: "Media-effect" },
  { href: "#voorbeeld", label: "Voorbeeld" },
  { href: "#methode", label: "Methode" },
];

/** De drie stappen van de werkwijze. */
export const STEPS = [
  {
    number: "01",
    title: "Meten",
    body: "We koppelen je mediabestedingen aan je eigen resultaatcijfers en aan de factoren die er verder toe doen: prijs, promoties, seizoen, markt.",
  },
  {
    number: "02",
    title: "Begrijpen",
    body: "Het model schat welke bijdrage elk mediakanaal aan je resultaat heeft geleverd — over alle kanalen en alle weken tegelijk, met een bandbreedte.",
  },
  {
    number: "03",
    title: "Beslissen",
    body: "Je zet alternatieve budgetverdelingen naast elkaar en kiest er één die je kunt uitleggen, inclusief wat je niet zeker weet.",
  },
];

/** Vragen die de analyse beantwoordt — het methodeblok, kort gehouden. */
export const METHOD_QUESTIONS = [
  "Welke kanalen dragen naar schatting het meest bij?",
  "Waar zit verzadiging?",
  "Waar levert extra budget waarschijnlijk het meeste op?",
  "Wat gebeurt er als we budget verschuiven?",
  "Hoe groot is de onzekerheid rond die schatting?",
];

/** Drie principes rond onzekerheid. Een vertrouwenskenmerk, geen zwakte. */
export const TRUST_PRINCIPLES = [
  {
    number: "01",
    title: "Meerdere jaren data",
    body: "Media-effect is pas te scheiden van seizoen, prijs en promotie als je genoeg weken hebt gezien.",
  },
  {
    number: "02",
    title: "Altijd een bandbreedte",
    body: "Elk resultaat komt met het bereik waarbinnen het waarschijnlijk ligt. Ook als dat bereik ongemakkelijk breed is.",
  },
  {
    number: "03",
    title: "Menselijke interpretatie",
    body: "Een analist beoordeelt data, aannames en uitkomsten. Een model levert schattingen, geen besluiten.",
  },
];

/** Voor wie dit gesprek nuttig is — staat bij het formulier. */
export const FIT_CRITERIA = [
  "Je bent verantwoordelijk voor een substantieel mediabudget.",
  "Je werkt met meerdere mediakanalen naast elkaar.",
  "Je hebt historische data over bestedingen en resultaat.",
];

/** Voettekst: drie kolommen plus de slotregel. */
export const FOOTER_NAV = [
  {
    title: "Product",
    links: [
      { href: "#effect", label: "Media-effect" },
      { href: "#scenario", label: "Budgetscenario" },
      { href: "/login", label: "Inloggen" },
    ],
  },
  {
    title: "Inzicht",
    links: [
      { href: "#vraag", label: "De vraag" },
      { href: "#voorbeeld", label: "Voorbeeldanalyse" },
      { href: "#methode", label: "Methode" },
    ],
  },
  {
    title: "Contact",
    links: [
      { href: "#demo", label: "Vraag een demo aan" },
      { href: "#onzekerheid", label: "Hoe we met onzekerheid omgaan" },
    ],
  },
];
