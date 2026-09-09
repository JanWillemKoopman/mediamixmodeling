// De deterministische toestandsmachine achter de chat-gestuurde wizard.
//
// Kern-idee: "chat-gestuurd" is niet "LLM-gestuurd". De fase waarin een project zich
// bevindt wordt hier volledig DETERMINISTISCH afgeleid uit de bestaande data (bronnen,
// dataset, fit-jobs, runs) — precies zoals lib/pipelineStatus.ts dat voor de oude stepper
// deed. Er komt geen enkele Claude-call aan te pas om te bepalen welke bubbel/kaart de
// gebruiker nu ziet of welke vervolgstap-chips worden aangeboden. Alleen op de gemarkeerde
// beslismomenten (kolomrollen voorstellen, model optimaliseren) én bij vrij typen wordt de
// architect ingeschakeld.
//
// Elk hoofdonderwerp uit het MMM-traject krijgt hier zijn EIGEN fase, in plaats van meerdere
// onderwerpen samen te persen in één stap (zie de herziening t.o.v. de vorige indeling,
// waarin bijv. kolomherkenning + samenvoegen + parameter-tuning allemaal in "prepare"/
// "configure" zaten):
//   1. upload            — bestand uploaden
//   2. inspect            — data-inspectie & kolomherkenning (puur begrijpen, nog niets bewerken)
//   3. prepare_*           — data voorbereiden (cleaning, verrijking, event-dummy's, features)
//   4. context             — zakelijke context (prior-elicitatie) vóór er getuned wordt
//   5. tuning              — parameter-tuning: adstock/saturatie/priors per kanaal, prior
//                            predictive check, én (geavanceerd, met geteste standaardwaarden)
//                            de rekeninstellingen — bevestigen start meteen de berekening
//   6. fitting/fit_failed    — de berekening laten lopen
//   7. review/published      — twee-laags validatie (sampler-betrouwbaarheid + modelfit) en
//                             publiceren
//
// Terugkoppeling/iteratie ("ga terug naar stap X") is BEWUST geen onderdeel van deze
// state machine: die blijft een pure, voorwaartse afleiding uit de data. Het teruggaan zelf
// is een client-side "welke kaart toon ik nu" keuze (zie WizardChatContext.goToPhase),
// omdat niets aan de onderliggende data hoeft te worden vernietigd om een eerdere stap
// opnieuw te bekijken/aan te passen — een nieuw recept of een nieuwe configuratie maakt
// gewoon een nieuwe dataset-/run-versie aan, de bestaande historie blijft intact.

import { isRunning } from "@/lib/types";
import type { DatasetVersion, ModelConfiguration, RunView, SourceFile } from "@/lib/types";

export type WizardPhase =
  | "upload" // nog geen bronbestand
  | "inspect" // bron aanwezig, kolomherkenning nog niet bevestigd
  | "prepare_recipe" // herkenning bevestigd, nog geen (lopende) dataset — opschonen & verrijken
  | "prepare_running" // prepare-job loopt (samenvoegen + kwaliteitscheck)
  | "prepare_failed" // prepare mislukt — opnieuw
  | "prepare_review" // dataset klaar (prepared) — kwaliteitsrapport beoordelen + goedkeuren
  | "context" // dataset goedgekeurd — zakelijke context vastleggen (overslaanbaar)
  | "tuning" // zakelijke context afgehandeld — parameter-tuning (adstock/saturatie/priors)
  | "fitting" // fit-job loopt
  | "fit_failed" // laatste fit mislukt — opnieuw
  | "review" // run geslaagd, nog niet gepubliceerd — valideren + publiceren
  | "published"; // gepubliceerd naar het klantdashboard

export interface WizardData {
  sources: SourceFile[];
  dataset: DatasetVersion | null;
  configuration: ModelConfiguration | null;
  runs: RunView[];
  // Is er al zakelijke context vastgelegd (branche/omschrijving/marge/feiten)? Bepaalt of
  // de expliciete context-fase nog getoond wordt vóór het tunen.
  contextProvided?: boolean;
  // Heeft de gebruiker de context-fase deze sessie bewust overgeslagen (client-state)?
  skipContext?: boolean;
}

export function derivePhase({
  sources,
  dataset,
  runs,
  contextProvided,
  skipContext,
}: WizardData): WizardPhase {
  if (sources.length === 0) return "upload";

  // Eén bron ondersteund per project — kolomherkenning moet expliciet bevestigd zijn
  // vóórdat er iets wordt samengevoegd.
  const source = sources[0];
  if (!source.inspection_confirmed_at) return "inspect";

  const latest = runs[0] ?? null;
  const finishedRun = runs.find((r) => r.run.state === "completed") ?? null;

  // Is er al een afgeronde berekening, dan zijn we voorbij het rekenstadium.
  if (finishedRun) {
    if (finishedRun.result?.is_published) return "published";
    // Loopt er ná die run alweer een nieuwe? Dan zit de gebruiker in "fitting".
    if (latest && isRunning(latest.run)) return "fitting";
    return "review";
  }

  if (latest) {
    if (isRunning(latest.run)) return "fitting";
    if (latest.run.state === "failed" || latest.run.state === "cancelled") return "fit_failed";
  }

  // Nog geen berekening. Waar staat de dataset?
  if (dataset) {
    if (dataset.approved_at) {
      // Vóór het tunen: één keer om de zakelijke context vragen (branche, omschrijving,
      // marge) — de belangrijkste input voor de aannames. Overslaanbaar.
      if (!contextProvided && !skipContext) return "context";
      return "tuning";
    }
    if (dataset.status === "ready") return "prepare_review";
    if (dataset.status === "queued" || dataset.status === "building") return "prepare_running";
    if (dataset.status === "failed") return "prepare_failed";
  }
  return "prepare_recipe";
}

export function isWaitingPhase(phase: WizardPhase): boolean {
  return phase === "prepare_running" || phase === "fitting";
}
