// De acht stappen van het traject: één bron van waarheid voor de stappenbalk, de
// stapkaarten, het transcript en de gids.
//
// Waarom dit bestand bestaat (zie docs/CHAT_PIPELINE_HERZIENING.md §8.1): in de oude wizard
// stonden de teksten (lib/wizard/script.ts) los van de mogelijkheden (lib/wizard/turns/*.ts).
// Die twee konden uit elkaar lopen, en dat deden ze ook — de tuning-tekst beloofde een
// "gratis proefdraai" en "geavanceerde rekeninstellingen" die nergens bestonden. Hier
// declareert een stap zijn eigen acties, en de knoppen worden dáéruit gerenderd. Een knop
// die niet bestaat, kan niet in beeld komen; een actie die bestaat, kan niet ongenoemd
// blijven.
//
// Twee dingen die een stap NIET zelf doet:
//   * Hij bepaalt zijn status niet. Dat doet deriveFlowState (lib/flow/state.ts) uit de
//     feiten plus het grootboek. Een stap levert alleen predicaten aan.
//   * Hij voert niets uit. `actions()` beschrijft wat er kán, niet wat er gebeurt.

import { allows, isRunning, type ProjectSnapshot } from "@/lib/types";

export type StepId =
  | "goal" // 1. Waar wil je antwoord op?
  | "data" // 2. Data aanleveren
  | "columns" // 3. Klopt wat ik zie?
  | "prepare" // 4. Data klaarmaken
  | "beliefs" // 5. Wat weet jij al?
  | "launch" // 6. Controleren en rekenen
  | "results" // 7. Wat zegt het model?
  | "share"; // 8. Delen

/** Volgorde van het traject. Ook de volgorde waarin de balk ze toont. */
export const STEP_ORDER: StepId[] = [
  "goal",
  "data",
  "columns",
  "prepare",
  "beliefs",
  "launch",
  "results",
  "share",
];

/** Wat er in een stap is besloten. Eén rij per (project, stap) in mmm.project_steps. */
export interface StepDecision {
  step: StepId;
  decision: Record<string, unknown>;
  summary: string | null;
  decided_at: string;
  decided_by: string | null;
}

export type Ledger = Partial<Record<StepId, StepDecision>>;

export interface FlowContext {
  snapshot: ProjectSnapshot;
  ledger: Ledger;
}

/**
 * Eén handeling die de gebruiker in deze stap kan doen.
 *
 * `confirms` is geen opmaakdetail maar de invariant uit §8.2.5: een handeling met een
 * blijvend gevolg — samenvoegen, goedkeuren, rekenen, publiceren — mag alleen via een
 * scherm dat vooraf toont wat er gaat gebeuren. De test in lib/flow/__tests__ dwingt af dat
 * elke zulke actie die vlag draagt.
 */
export interface StepAction {
  id: string;
  label: string;
  tone: "primary" | "secondary";
  confirms: boolean;
  /** Springt naar een andere stap in plaats van hier iets te doen (terugkoppeling). */
  goTo?: StepId;
  /** Vraagt om vrije tekst in plaats van een enkele klik (bv. de bedrijfsomschrijving). */
  needsText?: boolean;
}

/** Er gebeurt iets op de achtergrond waar de gebruiker op wacht. Geen doodlopende weg. */
export interface WaitingState {
  /** Wat er nu gebeurt, in de woorden van de gebruiker. */
  stage: string;
  /** Waar de klok vanaf loopt. */
  since: string | null;
  /** Waarna het te lang duurt en we dat zeggen in plaats van door te blijven draaien. */
  stallAfterMinutes: number;
  expectation: string;
}

export interface StepDefinition {
  id: StepId;
  number: number;
  label: string;
  /** Waaróm deze stap bestaat — één zin, voor de balk en de opening van de gids. */
  purpose: string;
  /** Stappen waarvan deze afhangt; een latere wijziging daar maakt deze stap achterhaald. */
  dependsOn: StepId[];
  /**
   * Woont de beslissing van deze stap uitsluitend in het grootboek? Waar is: er is geen
   * andere tabel die dit vastlegt, dus het grootboek ís hier het feit.
   */
  ledgerOnly: boolean;
  /**
   * Invariant §8.2.6: is deze stap af te ronden zonder te typen? Alleen waar vrije tekst de
   * inhoud zélf is mag dit false zijn.
   */
  completableWithoutTyping: boolean;
  isDone(ctx: FlowContext): boolean;
  /**
   * Is wat hier is afgerond nog steeds geldig?
   *
   * Veroudering volgt normaal uit de tijden (iets bovenstrooms is later gewijzigd), maar
   * niet altijd: een resultaat kan gedeeld zijn terwijl het oordeel dat later niet meer
   * draagt. Dat mag nooit stilzwijgend als "afgerond" blijven staan.
   */
  stillValid?(ctx: FlowContext): boolean;
  /** Waarom deze stap nu niet gedaan kan worden, in mensentaal — of null. */
  blockedReason(ctx: FlowContext): string | null;
  /** Er loopt iets; de gebruiker hoeft niets te doen. */
  waiting(ctx: FlowContext): WaitingState | null;
  actions(ctx: FlowContext): StepAction[];
  /** Wanneer werd deze stap afgerond? Uit het feit als dat er is, anders uit het grootboek. */
  factDecidedAt(ctx: FlowContext): string | null;
}

// --- kleine helpers over de snapshot -------------------------------------------------

const source = (ctx: FlowContext) => ctx.snapshot.sources[0] ?? null;
const latestRun = (ctx: FlowContext) => ctx.snapshot.runs[0] ?? null;
const runningRun = (ctx: FlowContext) => ctx.snapshot.runs.find((r) => isRunning(r.run)) ?? null;
const completedRun = (ctx: FlowContext) =>
  ctx.snapshot.runs.find((r) => r.run.state === "completed") ?? null;
const failedRun = (ctx: FlowContext) => {
  const latest = latestRun(ctx);
  return latest && (latest.run.state === "failed" || latest.run.state === "cancelled") ? latest : null;
};
const publishedRun = (ctx: FlowContext) =>
  ctx.snapshot.runs.find((r) => r.result?.is_published) ?? null;

/** Het aantal kanalen in de goedgekeurde dataset — nodig om stap 5 te kunnen tonen. */
function channelNames(ctx: FlowContext): string[] {
  const roles = ctx.snapshot.approvedDataset?.column_roles ?? {};
  return Object.entries(roles)
    .filter(([, role]) => role === "spend")
    .map(([name]) => name);
}

// --- de acht stappen -------------------------------------------------------------------

export const STEPS: Record<StepId, StepDefinition> = {
  goal: {
    id: "goal",
    number: 1,
    label: "Waar wil je antwoord op?",
    purpose:
      "Waar je op wilt sturen bepaalt welke uitkomst vooropgezet wordt en in welke woorden " +
      "de rest van dit traject met je praat.",
    dependsOn: [],
    ledgerOnly: true,
    completableWithoutTyping: true,
    isDone: (ctx) => ctx.ledger.goal != null,
    blockedReason: () => null,
    waiting: () => null,
    factDecidedAt: (ctx) => ctx.ledger.goal?.decided_at ?? null,
    actions: (ctx) =>
      ctx.ledger.goal
        ? [{ id: "goal.change", label: "Ander doel kiezen", tone: "secondary", confirms: false }]
        : [
            { id: "goal.budget", label: "Mijn budget beter verdelen", tone: "primary", confirms: false },
            { id: "goal.effect", label: "Aantonen wat mijn kanalen opleveren", tone: "primary", confirms: false },
            { id: "goal.report", label: "Periodiek rapporteren", tone: "primary", confirms: false },
          ],
  },

  data: {
    id: "data",
    number: 2,
    label: "Data aanleveren",
    purpose:
      "Eén bestand met per week je resultaat en je uitgaven per kanaal. Je ziet vooraf waar " +
      "het aan moet voldoen, en meteen na het uploaden of het bruikbaar is.",
    dependsOn: ["goal"],
    ledgerOnly: false,
    completableWithoutTyping: true,
    isDone: (ctx) => source(ctx) != null,
    blockedReason: (ctx) =>
      ctx.ledger.goal == null ? "Kies eerst waar je antwoord op wilt — dat bepaalt hoe ik je data lees." : null,
    waiting: () => null,
    factDecidedAt: (ctx) => source(ctx)?.created_at ?? null,
    actions: (ctx) =>
      source(ctx)
        ? [
            { id: "data.replace", label: "Ander bestand gebruiken", tone: "secondary", confirms: true },
            { id: "data.continue", label: "Verder met dit bestand", tone: "primary", confirms: false },
          ]
        : [
            { id: "data.upload", label: "Kies je bestand", tone: "primary", confirms: false },
            { id: "data.template", label: "Download een voorbeeldbestand", tone: "secondary", confirms: false },
            { id: "data.demo", label: "Gebruik een demo-dataset", tone: "secondary", confirms: false },
          ],
  },

  columns: {
    id: "columns",
    number: 3,
    label: "Klopt wat ik zie?",
    purpose:
      "Welke kolom je resultaat is, welke kolommen kanalen zijn en waarin die gemeten zijn. " +
      "Een kanaal in GRP's dat voor euro's wordt aangezien, maakt elk budgetadvies later " +
      "betekenisloos — daarom kijken we hier samen.",
    dependsOn: ["data"],
    ledgerOnly: false,
    completableWithoutTyping: true,
    isDone: (ctx) => source(ctx)?.inspection_confirmed_at != null,
    blockedReason: (ctx) => (source(ctx) == null ? "Upload eerst je databestand." : null),
    waiting: () => null,
    factDecidedAt: (ctx) => source(ctx)?.inspection_confirmed_at ?? null,
    actions: (ctx) => {
      const src = source(ctx);
      if (!src) return [];
      return [
        { id: "columns.confirm", label: "Ja, dit klopt", tone: "primary", confirms: false },
        { id: "columns.edit", label: "Iets aanpassen", tone: "secondary", confirms: false },
        {
          id: "columns.inspect",
          label: "Laat de gids mijn data grondig nakijken",
          tone: "secondary",
          confirms: false,
        },
      ];
    },
  },

  prepare: {
    id: "prepare",
    number: 4,
    label: "Data klaarmaken",
    purpose:
      "Gaten, uitschieters en kanalen die te veel op elkaar lijken. Elk punt wordt een " +
      "keuze in gewone taal, niet een instelling.",
    dependsOn: ["columns"],
    ledgerOnly: false,
    completableWithoutTyping: true,
    isDone: (ctx) => ctx.snapshot.approvedDataset != null,
    blockedReason: (ctx) =>
      source(ctx)?.inspection_confirmed_at == null ? "Bevestig eerst wat elke kolom betekent." : null,
    waiting: (ctx) => {
      const ds = ctx.snapshot.dataset;
      if (!ds || (ds.status !== "queued" && ds.status !== "building")) return null;
      return {
        stage: ds.status === "queued" ? "In de wachtrij" : "Je data wordt klaargemaakt en gecontroleerd",
        since: ds.created_at,
        stallAfterMinutes: 3,
        expectation: "Dit duurt normaal minder dan een minuut.",
      };
    },
    factDecidedAt: (ctx) => ctx.snapshot.approvedDataset?.approved_at ?? null,
    actions: (ctx) => {
      const ds = ctx.snapshot.dataset;
      if (ds?.status === "queued" || ds?.status === "building") return [];
      if (ds?.status === "failed") {
        return [
          { id: "prepare.retry", label: "Aanpassen en opnieuw proberen", tone: "primary", confirms: true },
          { id: "prepare.back", label: "Terug naar de kolommen", tone: "secondary", confirms: false, goTo: "columns" },
        ];
      }
      if (ds?.status === "ready" && !ds.approved_at) {
        return [
          { id: "prepare.approve", label: "Dit ziet er goed uit", tone: "primary", confirms: true },
          { id: "prepare.adjust", label: "Ik wil iets aanpassen", tone: "secondary", confirms: false },
        ];
      }
      if (ctx.snapshot.approvedDataset) {
        return [{ id: "prepare.rebuild", label: "Data opnieuw klaarmaken", tone: "secondary", confirms: true }];
      }
      return [
        { id: "prepare.start", label: "Maak mijn data klaar", tone: "primary", confirms: true },
        { id: "prepare.note", label: "Eerst iets doorgeven over bijzondere weken", tone: "secondary", confirms: false, needsText: true },
      ];
    },
  },

  beliefs: {
    id: "beliefs",
    number: 5,
    label: "Wat weet jij al?",
    purpose:
      "Wat jij over je markt en je kanalen weet, is de sterkste input die dit model kan " +
      "krijgen. Geen getallen — en \"weet ik niet\" is overal een volwaardig antwoord.",
    dependsOn: ["prepare"],
    ledgerOnly: true,
    // Het bedrijfsverhaal is vrije tekst, maar de stap is af te ronden met alleen keuzes:
    // de context mag leeg blijven, de kanaalvragen hebben overal "weet ik niet".
    completableWithoutTyping: true,
    isDone: (ctx) => ctx.ledger.beliefs != null,
    blockedReason: (ctx) =>
      ctx.snapshot.approvedDataset == null ? "Keur eerst je klaargemaakte data goed." : null,
    waiting: () => null,
    factDecidedAt: (ctx) => ctx.ledger.beliefs?.decided_at ?? null,
    actions: (ctx) => {
      if (ctx.snapshot.approvedDataset == null) return [];
      const done = ctx.ledger.beliefs != null;
      return [
        {
          id: "beliefs.fill",
          label: done ? "Mijn antwoorden aanpassen" : "Beantwoord de vragen",
          tone: "primary",
          confirms: false,
        },
        {
          id: "beliefs.suggest",
          label: "Vul dit voor me in op basis van mijn data",
          tone: "secondary",
          confirms: false,
        },
        ...(channelNames(ctx).length === 0
          ? []
          : [
              {
                id: "beliefs.unknown",
                label: "Ik weet het nog niet — laat mijn data alles bepalen",
                tone: "secondary" as const,
                confirms: false,
              },
            ]),
      ];
    },
  },

  launch: {
    id: "launch",
    number: 6,
    label: "Controleren en rekenen",
    purpose:
      "Eerst zie je precies wat er berekend gaat worden, dan pas begint het rekenen. " +
      "Dat duurt een paar minuten en je kunt intussen wegklikken.",
    dependsOn: ["beliefs"],
    ledgerOnly: false,
    completableWithoutTyping: true,
    isDone: (ctx) => completedRun(ctx) != null,
    blockedReason: (ctx) => (ctx.ledger.beliefs == null ? "Beantwoord eerst de vragen over je kanalen." : null),
    waiting: (ctx) => {
      const running = runningRun(ctx);
      if (!running) return null;
      return {
        stage: RUN_STAGE_LABEL[running.run.state] ?? "Bezig",
        since: running.run.created_at,
        stallAfterMinutes: 12,
        expectation: "Een berekening is meestal binnen 3 à 5 minuten klaar.",
      };
    },
    factDecidedAt: (ctx) => completedRun(ctx)?.run.finished_at ?? completedRun(ctx)?.run.created_at ?? null,
    actions: (ctx) => {
      if (runningRun(ctx)) return [];
      const failed = failedRun(ctx);
      if (failed) {
        return [
          { id: "launch.diagnose", label: "Laat de gids meekijken wat er misging", tone: "primary", confirms: false },
          { id: "launch.adjust", label: "Mijn antwoorden aanpassen", tone: "secondary", confirms: false, goTo: "beliefs" },
          { id: "launch.retry", label: "Opnieuw proberen", tone: "secondary", confirms: true },
        ];
      }
      if (completedRun(ctx)) {
        return [{ id: "launch.again", label: "Opnieuw berekenen", tone: "secondary", confirms: true }];
      }
      return [
        { id: "launch.review", label: "Laat zien wat er berekend wordt", tone: "primary", confirms: false },
        { id: "launch.start", label: "Start de berekening", tone: "primary", confirms: true },
      ];
    },
  },

  results: {
    id: "results",
    number: 7,
    label: "Wat zegt het model?",
    purpose:
      "Eerst of je hierop kunt sturen, dan wat er gebeurd is, dan pas de cijfers. " +
      "De techniek staat eronder, ingeklapt.",
    dependsOn: ["launch"],
    ledgerOnly: true,
    completableWithoutTyping: true,
    isDone: (ctx) => ctx.ledger.results != null,
    blockedReason: (ctx) =>
      completedRun(ctx) == null ? "Er is nog geen afgeronde berekening om te bekijken." : null,
    waiting: () => null,
    factDecidedAt: (ctx) => ctx.ledger.results?.decided_at ?? null,
    actions: (ctx) => {
      const run = completedRun(ctx);
      if (!run) return [];
      const canPublish = allows(run.validation, "publish");
      // Haalt het model de drempel niet, dan is "verder" niet de uitweg: de twee echte
      // uitwegen zijn opnieuw afstemmen of de data aanpassen. Ze staan hier als actie,
      // zodat deze toestand nooit doodloopt (invariant §8.2.1).
      if (!canPublish) {
        return [
          { id: "results.retune", label: "Mijn antwoorden aanpassen en opnieuw rekenen", tone: "primary", confirms: false, goTo: "beliefs" },
          { id: "results.redata", label: "Terug naar mijn data", tone: "secondary", confirms: false, goTo: "prepare" },
          { id: "results.explain", label: "Leg uit wat hier misgaat", tone: "secondary", confirms: false },
        ];
      }
      return [
        { id: "results.accept", label: "Duidelijk — ga door naar delen", tone: "primary", confirms: false },
        { id: "results.explain", label: "Leg dit verder uit", tone: "secondary", confirms: false },
        { id: "results.retune", label: "Toch opnieuw afstemmen", tone: "secondary", confirms: false, goTo: "beliefs" },
      ];
    },
  },

  share: {
    id: "share",
    number: 8,
    label: "Delen",
    purpose: "Naar het klantdashboard, of als rapport mee. Met wat de klant wél en niet ziet.",
    dependsOn: ["results"],
    ledgerOnly: false,
    completableWithoutTyping: true,
    isDone: (ctx) => publishedRun(ctx) != null,
    // Een gedeeld resultaat waarvan het oordeel het niet (meer) draagt, is geen afgeronde
    // stap maar een achterhaalde. Dat kan echt gebeuren: de drempel kan later strenger
    // gezet zijn dan toen er gepubliceerd werd.
    stillValid: (ctx) => {
      const published = publishedRun(ctx);
      return published == null || allows(published.validation, "publish");
    },
    blockedReason: (ctx) => {
      const run = completedRun(ctx);
      if (!run) return "Er is nog geen afgerond resultaat om te delen.";
      if (!allows(run.validation, "publish")) {
        return "Dit model haalt de drempel voor delen niet. Pas je antwoorden of je data aan en reken opnieuw.";
      }
      return null;
    },
    waiting: () => null,
    factDecidedAt: (ctx) => publishedRun(ctx)?.result?.published_at ?? null,
    actions: (ctx) => {
      // Al gedeeld: dan is er altijd iets te doen, ook — juist — wanneer het oordeel het
      // niet meer draagt. Anders zou die toestand doodlopen op het enige moment waarop
      // handelen nodig is.
      if (publishedRun(ctx)) {
        return [
          { id: "share.view", label: "Bekijk het klantdashboard", tone: "primary", confirms: false },
          { id: "share.again", label: "Een nieuwe berekening draaien", tone: "secondary", confirms: false, goTo: "beliefs" },
        ];
      }
      const run = completedRun(ctx);
      if (!run || !allows(run.validation, "publish")) return [];
      return [
        { id: "share.publish", label: "Deel met de klant", tone: "primary", confirms: true },
        { id: "share.preview", label: "Laat eerst zien wat de klant ziet", tone: "secondary", confirms: false },
      ];
    },
  },
};

/**
 * Wat de worker nu doet, in de woorden van de gebruiker.
 *
 * Losstaand van RUN_STATE_LABEL in lib/types.ts: dat is de neutrale, technische benaming die
 * ook het bouwersoverzicht gebruikt. Hier praat de gids tegen iemand die wacht.
 */
const RUN_STAGE_LABEL: Record<string, string> = {
  queued: "In de wachtrij",
  validating: "Je antwoorden controleren",
  preparing_data: "Je data klaarzetten",
  building_model: "Het model opbouwen en je verwachtingen toetsen",
  validating_model: "Toetsen of dit betrouwbaar is",
  sampling: "Rekenen",
  calculating_results: "De uitkomst samenstellen",
};

export function stepDefinition(id: StepId): StepDefinition {
  return STEPS[id];
}
