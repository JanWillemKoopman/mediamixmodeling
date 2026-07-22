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
//                            predictive check — een volwaardige, prominente stap
//   6. modelspec            — modelspecificatie: sampler-instellingen + bevestiging
//   7. fitting/fit_failed    — MCMC-sampling laten lopen
//   8. review/published      — twee-laags validatie (sampler-betrouwbaarheid + modelfit) en
//                             publiceren
//
// Terugkoppeling/iteratie ("ga terug naar stap X") is BEWUST geen onderdeel van deze
// state machine: die blijft een pure, voorwaartse afleiding uit de data. Het teruggaan zelf
// is een client-side "welke kaart toon ik nu" keuze (zie WizardChatContext.goToPhase),
// omdat niets aan de onderliggende data hoeft te worden vernietigd om een eerdere stap
// opnieuw te bekijken/aan te passen — een nieuw recept of een nieuwe configuratie maakt
// gewoon een nieuwe dataset-/run-versie aan, de bestaande historie blijft intact.

import type { Dataset, Job, ModelRun, SourceFile } from "@/lib/types";

export type WizardPhase =
  | "upload" // nog geen bronbestand
  | "inspect" // bron aanwezig, kolomherkenning nog niet bevestigd
  | "prepare_recipe" // herkenning bevestigd, nog geen (lopende) dataset — opschonen & verrijken
  | "prepare_running" // prepare-job loopt (samenvoegen + kwaliteitscheck)
  | "prepare_failed" // prepare mislukt — opnieuw
  | "prepare_review" // dataset klaar (prepared) — kwaliteitsrapport beoordelen + goedkeuren
  | "context" // dataset goedgekeurd — zakelijke context vastleggen (overslaanbaar)
  | "tuning" // zakelijke context afgehandeld — parameter-tuning (adstock/saturatie/priors)
  | "modelspec" // tuning bevestigd — sampler-instellingen + samenvatting, klaar om te draaien
  | "fitting" // fit-job loopt
  | "fit_failed" // laatste fit mislukt — opnieuw
  | "review" // run geslaagd, nog niet gepubliceerd — valideren + publiceren
  | "published"; // gepubliceerd naar het klantdashboard

export interface WizardData {
  sources: SourceFile[];
  dataset: Dataset | null;
  jobs: Job[];
  runs: ModelRun[];
  // Is er al zakelijke context vastgelegd (branche/omschrijving/marge/feiten)? Bepaalt of
  // de expliciete context-fase nog getoond wordt vóór het tunen.
  contextProvided?: boolean;
  // Heeft de gebruiker de context-fase deze sessie bewust overgeslagen (client-state)?
  skipContext?: boolean;
}

const FIT_TYPES = ["fit", "fit_hierarchical"] as const;

export function derivePhase({ sources, dataset, jobs, runs, contextProvided, skipContext }: WizardData): WizardPhase {
  if (sources.length === 0) return "upload";

  // Eén bron ondersteund per project (zie SourceUpload/UploadCard) — kolomherkenning moet
  // expliciet bevestigd zijn vóórdat er iets wordt samengevoegd.
  const source = sources[0];
  if (!source.inspection_confirmed_at) return "inspect";

  const fitJobs = jobs.filter((j) => (FIT_TYPES as readonly string[]).includes(j.type));
  const latestFit = fitJobs[0] ?? null; // jobs komen binnen als "newest first"
  const latestRun = runs[0] ?? null;

  // Als er al een geslaagde run is, zijn we voorbij het fit-stadium: valideren/publiceren.
  if (latestRun) {
    if (latestRun.is_published) return "published";
    // Loopt er ná de laatste run alweer een nieuwe fit? Dan zit de gebruiker in "fitting".
    if (latestFit && (latestFit.status === "queued" || latestFit.status === "running")) {
      return "fitting";
    }
    return "review";
  }

  // Nog geen run. Beoordeel het fit-stadium op basis van de laatste fit-job.
  if (latestFit) {
    if (latestFit.status === "failed" || latestFit.status === "cancelled") return "fit_failed";
    if (latestFit.status === "queued" || latestFit.status === "running") return "fitting";
    // succeeded zonder run-rij: worker is nog aan het wegschrijven — behandel als fitting.
    return "fitting";
  }

  // Nog geen fit gestart. Waar staat de dataset?
  if (dataset) {
    if (dataset.status === "approved") {
      // Vóór het tunen: één keer om de zakelijke context vragen (branche, omschrijving,
      // marge) — de belangrijkste input voor priors. Overslaanbaar.
      if (!contextProvided && !skipContext) return "context";
      // Parameter-tuning is nu een eigen, volwaardige stap; pas als die expliciet
      // bevestigd is, gaan we door naar sampler-instellingen.
      if (!dataset.tuning_confirmed_at) return "tuning";
      return "modelspec";
    }
    if (dataset.status === "prepared") return "prepare_review";
    if (dataset.status === "preparing") return "prepare_running";
    if (dataset.status === "failed") return "prepare_failed";
    // draft: recept nog niet ingediend.
  }
  return "prepare_recipe";
}

// True zolang we op een asynchrone worker (Modal) wachten — de client pollt dan zachtjes
// door zodat de fase vanzelf doorschuift zodra Realtime/DB de nieuwe status toont.
export function isWaitingPhase(phase: WizardPhase): boolean {
  return phase === "prepare_running" || phase === "fitting";
}
