// Gestructureerde copy van de one-page op één plek, zodat de tekst te reviewen is zonder
// door JSX te lezen. Lopende alinea's staan bij de sectie zelf; hier staat alles wat een
// lijst, stap of vraag is. Toon: helder, concreet, zakelijk — verkoop de uitkomst, niet de
// techniek (docs/one-page-website-plan.md §4).

export const SITE = {
  wordmark: "media mix modeling",
  ctaPrimary: "Vraag een demo aan",
  ctaSecondary: "Bekijk een voorbeeldanalyse",
};

/** De vijf managementvragen uit sectie 06. Elk antwoord eindigt bij een beslissing. */
export const MANAGEMENT_QUESTIONS = [
  {
    question: "Welke mediakanalen dragen naar schatting bij aan ons resultaat?",
    answer:
      "Je ziet per kanaal de geschatte bijdrage aan je resultaat, met de bandbreedte eromheen. Daarmee weet je niet alleen welke kanalen ertoe lijken te doen, maar ook hoe zeker dat beeld is.",
  },
  {
    question: "Waar zit ruimte om budget anders te verdelen?",
    answer:
      "Kanalen waar extra budget naar verwachting weinig toevoegt, en kanalen waar nog ruimte lijkt te zitten, worden naast elkaar zichtbaar. Dat is het startpunt van een verschuiving, geen automatisch besluit.",
  },
  {
    question: "Wat kan er gebeuren als we onze budgetverdeling veranderen?",
    answer:
      "Je vergelijkt je huidige verdeling met een alternatieve verdeling en ziet het geschatte effect op je resultaat — als bereik, niet als belofte.",
  },
  {
    question: "Hoe verhouden onze kanalen zich tot elkaar?",
    answer:
      "Kanalen worden op dezelfde manier en over dezelfde periode beoordeeld. Daardoor vergelijk je ze eindelijk op één maatstaf in plaats van op zeven verschillende rapportages.",
  },
  {
    question: "Hoe onderbouw ik mijn mediaplan richting directie?",
    answer:
      "Je legt uit welke aannames onder het plan liggen, wat het geschatte effect is en hoe zeker dat is. Dat gesprek gaat over keuzes, niet over de betrouwbaarheid van dashboards.",
  },
];

/** De vijf stappen van sectie 07: van meten naar bijsturen. */
export const DECISION_FLOW = [
  { step: "Meten", question: "Wat hebben we geïnvesteerd?", body: "Bestedingen per kanaal, week voor week, naast je eigen resultaatcijfers." },
  { step: "Begrijpen", question: "Wat lijkt het effect daarvan te zijn?", body: "De geschatte bijdrage van media, gescheiden van prijs, promoties en seizoen." },
  { step: "Vergelijken", question: "Hoe verhouden kanalen en scenario's zich?", body: "Dezelfde maatstaf voor elk kanaal, en alternatieve verdelingen naast elkaar." },
  { step: "Beslissen", question: "Waar zetten we budget in?", body: "Een keuze die je kunt uitleggen, inclusief wat je niet zeker weet." },
  { step: "Bijsturen", question: "Wat betekent dit voor het volgende mediaplan?", body: "Een afgesproken meetperiode, zodat de volgende analyse je aanname toetst." },
];

/** De vier stappen van sectie 08. */
export const HOW_IT_WORKS = [
  {
    title: "Data",
    body: "Je mediabestedingen, je resultaten en de factoren die er verder toe doen: prijs, promoties, seizoen, marktomstandigheden. Wekelijks, over meerdere jaren.",
    note: "Wat we van je nodig hebben, heb je meestal al.",
  },
  {
    title: "Analyse",
    body: "De onderliggende relaties tussen bestedingen, resultaat en die andere factoren worden geanalyseerd — over alle weken en alle kanalen tegelijk.",
    note: "Media Mix Modeling is de methode achter de analyse.",
  },
  {
    title: "Inzicht",
    body: "De geschatte bijdrage van elk kanaal wordt zichtbaar, met de bandbreedte eromheen. Inclusief wat de analyse níét kan aantonen.",
    note: "Geen enkel getal zonder marge.",
  },
  {
    title: "Beslissing",
    body: "Je beoordeelt je budgetverdeling met dit inzicht ernaast en legt vast welke aanname je de komende periode toetst.",
    note: "Hier begint de waarde.",
  },
];

/** Voor wie dit relevant is — staat vlak voor de CTA. */
export const FIT_CRITERIA = [
  "Je bent verantwoordelijk voor een mediabudget dat over meerdere kanalen wordt verdeeld.",
  "Je hebt ongeveer twee jaar aan wekelijkse cijfers over bestedingen en resultaat.",
  "Je moet je mediaplan intern kunnen onderbouwen, niet alleen rapporteren.",
  "Je hoeft zelf geen expert te zijn in analysemethoden — daar hebben wij ons voor.",
];
