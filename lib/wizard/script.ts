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
      "Nu de belangrijkste stap: parameter-tuning. Voor elk kanaal bepalen we samen wat je vooraf verwacht " +
      "— niet \"wat is het minimum en maximum\", maar \"wat verwacht je en hoe zeker ben je daarvan\". Dat " +
      "geldt voor de na-ijl (adstock), de verzadiging, en hoeveel effect je een kanaal toedicht. Onderaan " +
      "kun je een prior predictive check draaien: een goedkope voorproef die laat zien wat je gekozen priors " +
      "betekenen voor de omzet, nog vóórdat we echt gaan rekenen.",
    dossierLabel: "Parameter-tuning (priors)",
  },
  modelspec: {
    message:
      "De tuning staat vast. Laatste stap vóór het rekenen: de sampler-instellingen (hoeveel chains, " +
      "samples en tuning-stappen) en een overzicht van alle keuzes tot nu toe. Klopt alles? Dan starten we " +
      "de berekening.",
    dossierLabel: "Modelspecificatie",
  },
  fitting: {
    message:
      "De berekening loopt: dit is MCMC-sampling, geen simpele regressie, dus het duurt langer — doorgaans " +
      "3 à 5 minuten. Het model schat per kanaal het effect, de na-ijl en het afnemend rendement, met " +
      "onzekerheidsmarges. Zodra er een waarschuwing is (bijv. divergenties) zie je die hier zo snel mogelijk.",
    dossierLabel: "Model berekenen (MCMC)",
  },
  fit_failed: {
    message:
      "De berekening is niet gelukt. Bekijk de melding hieronder. Vaak helpt een lichtere instelling of " +
      "het aanpassen van een kanaal. Je kunt het opnieuw proberen.",
    dossierLabel: "Berekening mislukt",
  },
  review: {
    message:
      "Klaar! Eerst het belangrijkste: is dit model betrouwbaar genoeg om op te sturen? Hieronder zie je dat " +
      "in twee lagen — is de sampler goed gesampled, en is de uitkomst inhoudelijk plausibel — met daarna " +
      "de resultaten zelf (effect en ROAS per kanaal, met onzekerheidsmarges). Niet goed genoeg? Dan kun je " +
      "gericht terug naar tuning of data. Wel goed genoeg? Dan kun je publiceren naar het klantdashboard.",
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
  { phases: ["tuning"], label: "5. Parameter-tuning", backTarget: "tuning" },
  { phases: ["modelspec"], label: "6. Modelspecificatie", backTarget: "modelspec" },
  { phases: ["fitting", "fit_failed"], label: "7. Berekenen" },
  { phases: ["review", "published"], label: "8. Valideren & publiceren" },
];

export function stepIndexForPhase(phase: WizardPhase): number {
  return PHASE_STEPS.findIndex((s) => s.phases.includes(phase));
}
