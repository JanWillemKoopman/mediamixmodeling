// Vaste, vooraf geschreven gespreksteksten per fase. Dit is het "script" dat de chat
// laat vóélen als een gesprek terwijl het in werkelijkheid een deterministische
// toestandsmachine is: elke bubbel hieronder kost 0 tokens. Alleen wanneer de gebruiker
// vrij typt of expliciet om een AI-voorstel vraagt, komt de architect eraan te pas.

import type { WizardPhase } from "@/lib/wizard/phase";

export interface PhaseScript {
  // De begeleidende assistent-bubbel bovenaan de kaart.
  message: string;
  // Korte statusregel voor het model-dossier rechts ("Nu bezig met…").
  dossierLabel: string;
}

export const PHASE_SCRIPT: Record<WizardPhase, PhaseScript> = {
  upload: {
    message:
      "Welkom! We bouwen samen stap voor stap een marketingmodel. Begin met één databestand: " +
      "een CSV met je wekelijkse KPI (omzet of leads) en de uitgaven per kanaal. " +
      "Je werkt met precies dit ene bestand — samenvoegen van meerdere bestanden hoeft niet.",
    dossierLabel: "Wachten op je databestand",
  },
  inspect: {
    message:
      "Voordat ik iets bewerk, wil ik eerst zeker weten dat ik je data goed begrijp. Ik heb de kolommen " +
      "alvast automatisch herkend: welke kolom de datum is (en op welk niveau — dag/week/maand), welke " +
      "kolom je KPI is, welke kolommen kanalen zijn (en of dat euro's, impressies of GRP's zijn), en welke " +
      "overige verklarende variabelen er zijn. Loop dit rustig na en corrigeer waar nodig — hier wordt nog " +
      "niets samengevoegd of opgeschoond.",
    dossierLabel: "Kolommen herkennen & bevestigen",
  },
  prepare_recipe: {
    message:
      "Kolommen zijn bevestigd. Nu gaan we de data zelf opschonen en verrijken: ontbrekende waarden en " +
      "uitschieters, een consistente tijdgranulariteit, en eventuele bijzondere weken (feestdagen, " +
      "campagnes) of afgeleide variabelen. Los hieronder per onderwerp — daarna voeg ik alles samen en " +
      "controleer ik de kwaliteit.",
    dossierLabel: "Data opschonen & verrijken",
  },
  prepare_running: {
    message:
      "Ik voeg de data samen tot één wekelijkse tabel en draai automatische kwaliteitscontroles. " +
      "Dit duurt meestal minder dan een minuut — je hoeft niets te doen.",
    dossierLabel: "Data samenvoegen & controleren",
  },
  prepare_failed: {
    message:
      "Het samenvoegen is helaas niet gelukt. Bekijk de melding hieronder. Meestal helpt het om de " +
      "kolomindeling of opschoonstap aan te passen en het opnieuw te proberen.",
    dossierLabel: "Samenvoegen mislukt",
  },
  prepare_review: {
    message:
      "De data is samengevoegd en gecontroleerd. Hieronder zie je het kwaliteitsrapport en een voorbeeld " +
      "van de weektabel. Ziet het er goed uit? Keur de dataset dan goed — daarna gaan we tunen.",
    dossierLabel: "Kwaliteit beoordelen",
  },
  context: {
    message:
      "Voordat we gaan tunen: vertel me kort iets over het bedrijf en de markt. Branche, gemiddelde marge " +
      "per verkochte eenheid en bijzonderheden (grote campagnes, seizoenspieken, prijswijzigingen, offline-" +
      "kanalen, een eerder lift-/geo-experiment) helpen om betere priors te kiezen — dit is de belangrijkste " +
      "input die een Bayesiaans model kan krijgen. Optioneel; je kunt het overslaan.",
    dossierLabel: "Zakelijke context",
  },
  tuning: {
    message:
      "Nu de belangrijkste stap: het model afstemmen op wat jij al weet. Voor elk kanaal bepalen we samen wat " +
      "je vooraf verwacht — niet \"wat is het minimum en maximum\", maar \"wat verwacht je en hoe zeker ben je " +
      "daarvan\". Dat geldt voor de na-ijl (adstock), de verzadiging, en hoeveel effect je een kanaal toedicht. " +
      "Weet je het niet zeker? Laat dan gerust de AI optimaliseren — de standaardwaarden zijn ook prima. " +
      "Onderaan kun je eerst een snelle proefdraai doen (geen echte berekening, wel gratis) die laat zien wat " +
      "je keuzes betekenen voor de omzet. Klopt alles? Dan start de berekening meteen — de rekeninstellingen " +
      "staan al op geteste standaardwaarden, aan te passen onder \"geavanceerd\" als je dat wilt.",
    dossierLabel: "Model afstemmen",
  },
  fitting: {
    message:
      "De berekening loopt. Dit is een uitgebreide, stapsgewijze berekening — geen simpele optelsom — dus het " +
      "duurt langer: doorgaans 3 à 5 minuten. Per kanaal wordt geschat: het effect, hoe lang dat doorwerkt, en " +
      "het afnemend rendement, steeds met een realistische bandbreedte in plaats van één hard getal. Loopt de " +
      "berekening ergens vast of instabiel, dan zie je die waarschuwing hier zo snel mogelijk.",
    dossierLabel: "Model wordt berekend",
  },
  fit_failed: {
    message:
      "De berekening is niet gelukt. Bekijk de melding hieronder. Vaak helpt een lichtere instelling of " +
      "het aanpassen van een kanaal. Je kunt het opnieuw proberen.",
    dossierLabel: "Berekening mislukt",
  },
  review: {
    message:
      "Klaar! Eerst het belangrijkste: is dit model betrouwbaar genoeg om te versturen? Hieronder zie je dat " +
      "in twee stappen — liep de berekening zelf stabiel en betrouwbaar, en is de uitkomst ook inhoudelijk " +
      "logisch — met daarna de resultaten zelf (effect en rendement per kanaal, met bandbreedte). Niet goed " +
      "genoeg? Dan kun je gericht terug naar tuning of data. Wel goed genoeg? Dan kun je publiceren naar het " +
      "klantdashboard.",
    dossierLabel: "Valideren & publiceren",
  },
  published: {
    message:
      "Gepubliceerd! De klant ziet nu het afgeschermde dashboard met dit resultaat. Je kunt op elk moment " +
      "teruggaan naar een eerdere stap, een nieuwe, betere berekening draaien en die opnieuw publiceren.",
    dossierLabel: "Gepubliceerd",
  },
};

// Menselijke, genummerde faselabels voor de voortgangsbalk in het model-dossier. `backTarget`
// is de fase die geopend wordt als de bouwer op een AFGERONDE stap in deze lijst klikt (zie
// ModelDossier + WizardChatContext.goToPhase) — het startpunt van dat onderwerp, niet een
// tussentijdse "loopt nu"/"mislukt"-toestand.
export const PHASE_STEPS: { phases: WizardPhase[]; label: string; backTarget?: WizardPhase }[] = [
  { phases: ["upload"], label: "1. Data uploaden" },
  { phases: ["inspect"], label: "2. Data-inspectie & kolomherkenning", backTarget: "inspect" },
  {
    phases: ["prepare_recipe", "prepare_running", "prepare_failed", "prepare_review"],
    label: "3. Data voorbereiden",
    backTarget: "prepare_recipe",
  },
  { phases: ["context"], label: "4. Zakelijke context", backTarget: "context" },
  { phases: ["tuning"], label: "5. Model afstemmen", backTarget: "tuning" },
  { phases: ["fitting", "fit_failed"], label: "6. Berekenen" },
  { phases: ["review", "published"], label: "7. Valideren & publiceren" },
];

export function stepIndexForPhase(phase: WizardPhase): number {
  return PHASE_STEPS.findIndex((s) => s.phases.includes(phase));
}
