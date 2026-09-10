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
  /**
   * Wat er gaat gebeuren, in mensentaal. Verplicht bij `confirms` — een bevestiging die
   * niet zegt waarvoor je tekent, is geen bevestiging maar een extra klik.
   */
  confirmPrompt?: string;
  /** Springt naar een andere stap in plaats van hier iets te doen (terugkoppeling). */
  goTo?: StepId;
  /** Vraagt om vrije tekst in plaats van een enkele klik (bv. de bedrijfsomschrijving). */
  needsText?: boolean;
  /**
   * Wordt volledig in de kaart afgehandeld en gaat niet naar de server: een bestand kiezen,
   * een sjabloon downloaden, terug naar de keuzes van deze stap. De flow-route weigert zo'n
   * actie dan ook, zodat er geen tweede pad ontstaat waarlangs iets stiekem tóch iets doet.
   */
  local?: boolean;
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
  /** Waaróm deze stap bestaat — één zin, voor de balk. */
  purpose: string;
  /**
   * Waarmee de gids deze stap opent, in de chat. Vaste tekst: 0 tokens, en daardoor te
   * toetsen. De begeleiding is een product-artefact, geen modeluitvoer — een wijziging
   * hoort zichtbaar te zijn in de diff van een pull request (het golden transcript in
   * lib/flow/__tests__/copy.test.ts legt ze vast).
   */
  opening: string;
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

// --- de acht stappen -------------------------------------------------------------------

export const STEPS: Record<StepId, StepDefinition> = {
  goal: {
    id: "goal",
    number: 1,
    label: "Waar wil je antwoord op?",
    purpose:
      "Waar je op wilt sturen bepaalt welke uitkomst vooropgezet wordt en in welke woorden " +
      "de rest van dit traject met je praat.",
    opening:
      "Welkom. We gaan samen een marketingmodel bouwen dat laat zien wat jouw kanalen opleveren. Dat doen we in acht stappen; je ziet links steeds waar je bent.\n\nOm te beginnen: waar wil je antwoord op? Dat bepaalt wat ik straks vooropzet.",
    dependsOn: [],
    ledgerOnly: true,
    completableWithoutTyping: true,
    // Twee vragen, en de stap is pas af als ze allebei beantwoord zijn. Zonder die tweede
    // eis zou "doel gekozen" al een vinkje geven terwijl de helft nog open staat — precies
    // het soort halve waarheid dat de oude voortgangsbalk toonde.
    isDone: (ctx) => ctx.ledger.goal?.decision.kpi_type != null,
    blockedReason: () => null,
    waiting: () => null,
    factDecidedAt: (ctx) => ctx.ledger.goal?.decided_at ?? null,
    actions: (ctx) => {
      const decision = ctx.ledger.goal?.decision ?? {};
      if (decision.aim == null) {
        return [
          { id: "goal.budget", label: "Mijn budget beter verdelen", tone: "primary", confirms: false },
          { id: "goal.effect", label: "Aantonen wat mijn kanalen opleveren", tone: "primary", confirms: false },
          { id: "goal.report", label: "Periodiek rapporteren", tone: "primary", confirms: false },
        ];
      }
      if (decision.kpi_type == null) {
        // Waar de gebruiker op stuurt bepaalt de rekenwijze (geld of hele eenheden) en de
        // woordkeuze van elk volgend scherm.
        return [
          { id: "goal.kpi_revenue", label: "Omzet in euro's", tone: "primary", confirms: false },
          { id: "goal.kpi_orders", label: "Aantal bestellingen", tone: "primary", confirms: false },
          { id: "goal.kpi_leads", label: "Aantal leads", tone: "primary", confirms: false },
          { id: "goal.kpi_sessions", label: "Aantal bezoeken", tone: "primary", confirms: false },
        ];
      }
      return [{ id: "goal.change", label: "Ander doel kiezen", tone: "secondary", confirms: false }];
    },
  },

  data: {
    id: "data",
    number: 2,
    label: "Data aanleveren",
    purpose:
      "Eén bestand met per week je resultaat en je uitgaven per kanaal. Je ziet vooraf waar " +
      "het aan moet voldoen, en meteen na het uploaden of het bruikbaar is.",
    opening:
      "Nu je databestand. Eén bestand, met per week een regel.\n\nWat erin moet staan:\n- **Een datumkolom** — één rij per week (of per dag, dan tel ik ze zelf op)\n- **Je resultaat** — omzet, orders of leads: het getal waar je op stuurt\n- **Je uitgaven per kanaal** — één kolom per kanaal\n\nLiefst minstens een jaar aan weken. Minder kan, maar dan wordt het model onzekerder, en dat zeg ik je dan ook.",
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
            { id: "data.replace", label: "Ander bestand gebruiken", tone: "secondary", confirms: true, confirmPrompt: "Je huidige bestand wordt vervangen. Alles wat je daarna hebt gedaan — kolommen, klaargemaakte data, berekeningen — hoort dan niet meer bij je nieuwe bestand." },
            { id: "data.continue", label: "Verder met dit bestand", tone: "primary", confirms: false },
          ]
        : [
            { id: "data.upload", label: "Kies je bestand", tone: "primary", confirms: false, local: true },
            { id: "data.template", label: "Download een voorbeeldbestand", tone: "secondary", confirms: false, local: true },
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
    opening:
      "Ik heb je bestand gelezen en per kolom een inschatting gemaakt: wat je datum is, wat je resultaat is, en welke kolommen kanalen zijn.\n\nLoop het even na. Vooral de eenheden: een kanaal dat in bereik of vertoningen staat maar voor euro's wordt aangezien, geeft later een rendement dat nergens op slaat.",
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
      // Geen aparte "iets aanpassen"-knop: de rollen zijn in de kaart zelf aan te klikken.
      // Een knop die alleen een bewerkmodus aanzet, is een extra stap zonder inhoud.
      return [
        { id: "columns.confirm", label: "Ja, dit klopt", tone: "primary", confirms: false },
        {
          // Laat de gids de hele reeks met code doorlopen; duurt een paar minuten en loopt
          // door als je de pagina sluit. Wordt door de kaart gestart, niet via /api/flow.
          id: "columns.inspect",
          label: "Laat de gids mijn data grondig nakijken",
          tone: "secondary",
          confirms: false,
          local: true,
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
    opening:
      "Nu maak ik je data klaar. Ik kijk naar ontbrekende weken, weken die er echt uitspringen, en kanalen die zo op elkaar lijken dat ze niet los te beoordelen zijn.\n\nWat ik tegenkom leg ik je voor als een gewone vraag — je hoeft geen instellingen te kiezen.",
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
          { id: "prepare.retry", label: "Aanpassen en opnieuw proberen", tone: "primary", confirms: true, confirmPrompt: "Ik probeer het samenvoegen opnieuw, met je aanpassingen erin." },
          { id: "prepare.back", label: "Terug naar de kolommen", tone: "secondary", confirms: false, goTo: "columns" },
        ];
      }
      if (ds?.status === "ready" && !ds.approved_at) {
        return [
          { id: "prepare.approve", label: "Dit ziet er goed uit", tone: "primary", confirms: true, confirmPrompt: "Hierna reken ik op deze data. Je kunt later terug, maar dan komt er een nieuwe versie bij." },
          { id: "prepare.adjust", label: "Ik wil iets aanpassen", tone: "secondary", confirms: false, local: true },
        ];
      }
      if (ctx.snapshot.approvedDataset) {
        return [{ id: "prepare.rebuild", label: "Data opnieuw klaarmaken", tone: "secondary", confirms: true, confirmPrompt: "Je data wordt opnieuw klaargemaakt. Je bestaande berekeningen blijven staan, maar horen dan bij de oude versie." }];
      }
      return [
        { id: "prepare.start", label: "Maak mijn data klaar", tone: "primary", confirms: true, confirmPrompt: "Ik voeg je data samen tot één weektabel en controleer de kwaliteit. Duurt meestal minder dan een minuut." },
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
    opening:
      "Dit is de belangrijkste stap, en hij duurt maar even.\n\nWat jij over je markt weet, weet het model niet. Als jij zegt dat tv bij jullie wekenlang doorwerkt, hoeft het model dat niet uit de cijfers te raden — en wordt de uitkomst scherper.\n\nJe kiest geen getallen, alleen wat je verwacht. En **\"weet ik niet\" is een prima antwoord**: dan laat ik je data het volledig bepalen.",
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
      return [
        { id: "beliefs.confirm", label: "Hiermee verder", tone: "primary", confirms: false },
        {
          id: "beliefs.unknown",
          label: "Ik weet het nog niet — laat mijn data alles bepalen",
          tone: "secondary",
          confirms: false,
        },
        {
          // Een vóórstel: de gids vult de kaart zichtbaar in, de gebruiker past aan en
          // bevestigt zelf. Er is geen pad waarlangs een voorstel zichzelf toepast.
          id: "beliefs.suggest",
          label: "Vul dit voor me in op basis van mijn data",
          tone: "secondary",
          confirms: false,
          local: true,
        },
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
    opening:
      "Voordat ik ga rekenen, laat ik je zien wat er precies berekend wordt: je resultaat, je kanalen met hun eenheid, en wat je hebt aangegeven.\n\nDe berekening zelf duurt meestal 3 à 5 minuten. Je kunt intussen gerust wegklikken — ik onthoud waar we waren.",
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
          { id: "launch.diagnose", label: "Laat de gids meekijken wat er misging", tone: "primary", confirms: false, local: true },
          { id: "launch.adjust", label: "Mijn antwoorden aanpassen", tone: "secondary", confirms: false, goTo: "beliefs" },
          { id: "launch.retry", label: "Opnieuw proberen", tone: "secondary", confirms: true, confirmPrompt: "Ik probeer de berekening opnieuw met dezelfde antwoorden." },
        ];
      }
      if (completedRun(ctx)) {
        return [{ id: "launch.again", label: "Opnieuw berekenen", tone: "secondary", confirms: true, confirmPrompt: "Er komt een nieuwe berekening bij. Je bestaande resultaat blijft gewoon bestaan." }];
      }
      // Geen aparte "laat zien wat er berekend wordt"-knop: dat overzicht staat al in de
      // kaart. Een knop die iets toont wat er al staat, is een stap zonder inhoud.
      return [
        { id: "launch.start", label: "Start de berekening", tone: "primary", confirms: true, confirmPrompt: "De berekening start. Dit duurt meestal 3 à 5 minuten; je kunt intussen wegklikken." },
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
    opening:
      "De berekening is klaar. Ik begin met het belangrijkste: kun je hierop sturen, of niet?\n\nDaarna wat er volgens het model gebeurd is, en pas daarna de cijfers zelf. De techniek staat eronder, ingeklapt — die hoef je niet te lezen.",
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
          { id: "results.explain", label: "Leg uit wat hier misgaat", tone: "secondary", confirms: false, local: true },
        ];
      }
      return [
        { id: "results.accept", label: "Duidelijk — ga door naar delen", tone: "primary", confirms: false },
        { id: "results.explain", label: "Leg dit verder uit", tone: "secondary", confirms: false, local: true },
        {
          // De uitgebreide analyse met grafieken: de gids verkent de uitkomst met code en levert
          // figuren op. Duurt een paar minuten en wordt door de schil gestart.
          id: "results.analysis",
          label: run.result?.analysis ? "Analyse opnieuw maken" : "Maak een uitgebreide analyse",
          tone: "secondary",
          confirms: false,
          local: true,
        },
        { id: "results.retune", label: "Toch opnieuw afstemmen", tone: "secondary", confirms: false, goTo: "beliefs" },
      ];
    },
  },

  share: {
    id: "share",
    number: 8,
    label: "Delen",
    purpose: "Naar het klantdashboard, of als rapport mee. Met wat de klant wél en niet ziet.",
    opening:
      "Klaar om te delen. De klant krijgt een eigen pagina met dit resultaat: de uitkomst en de bandbreedte eromheen, geen ruwe data en geen chat.\n\nJe kunt eerst bekijken wat hij precies te zien krijgt.",
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
          // De link staat in de kaart; deze knop springt er alleen naartoe.
          { id: "share.view", label: "Bekijk het klantdashboard", tone: "primary", confirms: false, local: true },
          { id: "share.again", label: "Een nieuwe berekening draaien", tone: "secondary", confirms: false, goTo: "beliefs" },
        ];
      }
      const run = completedRun(ctx);
      if (!run || !allows(run.validation, "publish")) return [];
      // Geen aparte "laat eerst zien wat de klant ziet"-knop: dat overzicht staat al in de
      // kaart, vóór de deelknop. Een knop die iets toont wat er al staat, voegt niets toe.
      return [
        { id: "share.publish", label: "Deel met de klant", tone: "primary", confirms: true, confirmPrompt: "De klant krijgt vanaf nu dit resultaat te zien op zijn eigen pagina, met de bandbreedte erbij." },
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
