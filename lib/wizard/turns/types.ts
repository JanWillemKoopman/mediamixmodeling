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

import type {
  DataInspection,
  DatasetVersion,
  ModelConfiguration,
  ModelIntent,
  RunView,
  SourceFile,
} from "@/lib/types";
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
  // Een voorstel dat de gebruiker met "ja" kan overnemen. Zo loopt een AI-voorstel altijd
  // langs dezelfde bevestiging, of het nu uit de chat komt of uit een verbeterronde — er is
  // geen pad waarlangs een voorstel zichzelf uitvoert.
  proposal?: { kind: "recipe" | "intent"; payload: unknown };
}

export interface TurnEnv {
  projectId: string;
  source: SourceFile | null;
  dataset: DatasetVersion | null;
  /** The approved version, if there is one — the only data a run may be based on. */
  approvedDataset: DatasetVersion | null;
  configuration: ModelConfiguration | null;
  runs: RunView[];
  kpiMargin: number | null;
  // Nieuwste diepe data-inspectie (server-side opgehaald, via Realtime bijgewerkt) — puur
  // gelezen, nooit client-side gepolld: zo verschijnt de uitkomst altijd zodra de
  // achtergrondtaak klaar is, ook als de client een tijdje niet actief was (mobiel, tab op
  // de achtergrond).
  latestInspection: DataInspection | null;
  // Klein stukje fase-lokale, niet uit de database afleidbare gesprekstoestand (bv. "we
  // zijn een correctie aan het opschrijven"). Wordt door ChatWizard teruggezet naar null
  // zodra de fase zelf wisselt.
  phaseState: unknown;
  setPhaseState: (s: unknown) => void;
  // De review-fase zet 'm ("gebruik de instellingen van run 2"), de tuning-fase leest 'm
  // als startpunt. Bewust de INTENTIE en niet de afgeleide instellingen: die worden per
  // dataset opnieuw afgeleid, dus hergebruiken wat er letterlijk uitkwam zou de afstemming
  // op de oude data vastzetten.
  reuseIntent: ModelIntent | null;
  setReuseIntent: (i: ModelIntent | null) => void;
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
