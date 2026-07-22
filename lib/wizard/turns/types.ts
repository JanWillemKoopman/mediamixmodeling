// Gedeelde vorm voor elke fase-turn-module (lib/wizard/turns/*.ts). Elke module vervangt één
// kaart uit het oude components/wizard/cards.tsx: geen React, geen formuliervelden — puur
// tekst in, tekst (of "ik snap dit niet, stuur door naar de architect") uit.
//
// `intro()` levert de tekst die getoond wordt zodra deze fase actief wordt (de vaste
// fase-bubbel + eventueel een genummerd menu). `resolve()` verwerkt het eerstvolgende
// getypte antwoord: een herkende menukeuze wordt direct en deterministisch afgehandeld
// (0 tokens); alles wat niet herkend wordt, geeft `{ handled: false }` terug zodat
// ChatWizard het bericht gewoon doorstuurt naar de architect (`/api/chat`) — precies zoals
// vrij typen vandaag al werkt.

import type { Dataset, Job, JobConfig, ModelRun, SourceFile } from "@/lib/types";
import type { WizardPhase } from "@/lib/wizard/phase";

export interface TurnReplyResult {
  handled: boolean;
  // Tekst die als lokale (0-tokens) assistent-bubbel verschijnt wanneer handled=true. Weglaten
  // wanneer het antwoord al is afgehandeld via `askArchitect` (die zet zijn eigen turn neer).
  reply?: string;
  // Vraag ChatWizard om router.refresh() te doen (er is iets in de database veranderd).
  refresh?: boolean;
  // Gezet wanneer deze keuze zelf een architect-beurt startte via `askArchitect` — die
  // beurt beheert de eigen bezig-status (streaming), dus ChatWizard mag "busy" dan niet
  // voortijdig weer vrijgeven.
  delegatedBusy?: boolean;
}

export interface TurnEnv {
  projectId: string;
  source: SourceFile | null;
  dataset: Dataset | null;
  jobs: Job[];
  runs: ModelRun[];
  jobConfigs: Record<string, JobConfig>;
  kpiMargin: number | null;
  // Klein stukje fase-lokale, niet uit de database afleidbare gesprekstoestand (bv. "we
  // zijn een correctie aan het opschrijven"). Wordt door ChatWizard teruggezet naar null
  // zodra de fase zelf wisselt.
  phaseState: unknown;
  setPhaseState: (s: unknown) => void;
  // Vervangt de kapotte "config hergebruiken"-knop: de review-fase zet 'm, de tuning-fase
  // leest 'm als startpunt i.p.v. de standaard sjabloon-config.
  reuseJobConfig: JobConfig | null;
  setReuseJobConfig: (c: JobConfig | null) => void;
  // Een los bericht direct in de chatstroom zetten — voor asynchrone uitkomsten (bv. de
  // diepe data-inspectie of een proefdraai die pas na een tijdje klaar is).
  pushMessage: (text: string) => void;
  refresh: () => void;
  // Client-only (geen database-rij): de context-fase "overslaan" voor deze sessie/project,
  // zodat de fase niet na een refresh opnieuw verschijnt (zie ChatWizard's skipContext).
  skipBusinessContext: () => void;
  // Terugkoppeling/iteratie: gericht teruggaan naar een eerdere fase (bv. "gebruik config
  // van run 2" springt naar tuning) — hetzelfde mechanisme als ModelDossier's klikbare stap.
  goToPhase: (phase: WizardPhase, reason?: string) => void;
  // Stuur een kant-en-klaar bericht naar de architect (streaming, net als vrij typen) —
  // voor het enkele geval waarin een menukeuze ("gebruik de aanbevolen instellingen") een
  // vaste architect-vraag betekent in plaats van een deterministisch antwoord.
  askArchitect: (message: string) => void;
}
