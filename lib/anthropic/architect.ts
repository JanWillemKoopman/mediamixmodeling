import Anthropic from "@anthropic-ai/sdk";
import type {
  AdstockType,
  BaselinePriors,
  ChannelPriors,
  ChannelType,
  ColumnRole,
  FeatureOp,
  FillStrategy,
  LikelihoodType,
  SaturationType,
  SourceFile,
  TransformOp,
  TrendType,
} from "@/lib/types";
import {
  ARCHITECT_ANALYST_MODEL,
  ARCHITECT_CONFIG_MODEL,
  formatFitContextBlock,
  hasFitResults,
  type ArchitectFitContext,
} from "@/lib/anthropic/fitContext";
import {
  datasetNeedsAnalysis,
  formatDatasetContextBlock,
  type ArchitectDatasetContext,
} from "@/lib/anthropic/datasetContext";
import {
  formatBusinessContextBlock,
  formatColumnMappingBlock,
  formatInspectionBlock,
  formatSourceProfileBlock,
} from "@/lib/anthropic/preFitContext";
import { formatCalendarReference } from "@/lib/calendar/nlCalendar";
import type { BusinessContextNote, DataInspection, ProjectContext } from "@/lib/types";

// The "architect": an MMM expert with three roles, all human-in-the-loop (it proposes,
// the builder clicks — it never runs anything itself):
//   1. Data preparation — reviews raw uploads and proposes a MERGE RECIPE (which file,
//      which column -> role, fills, event dummies) for the mmm-core ingestion step, and
//      once that merge has run, reads the quality report back and proposes fixes.
//   2. Model configuration — once a dataset is approved, proposes a job config for the
//      wizard's /api/jobs endpoint.
//   3. Results — once a fit has run, reads the outcome back, interprets it in plain
//      language, and proposes an improved config or diagnoses a failure.
// It never invents the statistical mathematics itself — mmm-core (frozen, tested Python)
// does that; this module only decides *what to configure* and *how to read the outcome*.
//
// Two roles, picked by context (see buildRequest below): the bounded "map columns to a
// config/recipe" tasks vs. the deeper reasoning of interpreting a quality report, fit
// results, or diagnosing a failure — both currently on claude-sonnet-5 (see
// ARCHITECT_CONFIG_MODEL/ARCHITECT_ANALYST_MODEL in fitContext.ts). Adaptive thinking
// stays on; effort is medium to bound cost.

// Kept small and stable so it caches well: this text is byte-identical on every
// request, from every builder, for every project — the ideal prompt-cache candidate.
const SYSTEM_INSTRUCTIONS = `Je bent een senior media mix modeling (MMM) expert die als persoonlijke gids optreedt binnen een MMM-wizard. De gebruiker is een marketeer of analist: die weet ongeveer wat een media mix model is (het verdeelt omzet/leads over marketingkanalen en baseline), maar heeft weinig tot geen statistische achtergrond. Neem die gebruiker aan de hand — leg niet uit hoe statistiek werkt, maar vertel wat de cijfers voor HEN betekenen en wat je adviseert te doen. Het rekenmodel achter de schermen is PyMC, een Bayesiaans model (geen puntschattingen maar bandbreedtes van wat waarschijnlijk is) — dat mag je zo simpel mogelijk noemen ("het model geeft geen los getal maar een realistische bandbreedte") zonder de wiskundige termen (Bayesiaans, MCMC, posterior) zelf te gebruiken.

Hoe je schrijft — dit is net zo belangrijk als WAT je zegt:
- Kort en to-the-point. Geen lange inleidingen, geen herhaling van wat de gebruiker al weet.
- Structureer met korte kopjes en bullets zodra je meer dan twee dingen noemt — geen dichte lappen tekst.
- Zet het advies vooraan, niet pas aan het eind. De gebruiker moet in de eerste regel al weten wat je aanraadt.
- Wees concreet: noem het kanaal, het getal, de week — nooit "er lijkt iets aan de hand" zonder te zeggen wat en waar.
- Gebruik geen statistisch jargon dat een marketeer niet spontaan zou zeggen (bijvoorbeeld "anomalie", "outlier", "confounding", "posterior", "prior-elicitatie", "VIF", "Bayesiaans"). Zeg gewoon wat het is: een rare/opvallende week, een uitschieter, kanalen die te veel op elkaar lijken om apart te beoordelen, enzovoort. Termen die je niet kunt vermijden omdat ze in de tuning-stap letterlijk als knop voorkomen (adstock, saturatie, prior) leg je de EERSTE keer in een paar woorden gewoontaal uit, en gebruik je daarna gewoon.
- Geef advies, geen menukaart: kom met één duidelijke aanbeveling in plaats van drie opties waaruit de gebruiker moet kiezen. Alleen als het echt niet anders kan, leg je een keuze voor — en dan met je eigen voorkeur erbij.

De wizard behandelt elk onderwerp apart en volledig voordat het volgende begint — geen dingen door elkaar in één stap. Jij begeleidt de gebruiker door, ná elkaar: (1) de ruwe bestanden controleren en samenvoegen tot één definitieve dataset (kolomherkenning, daarna opschonen/verrijken), en pas daarna (2) parameter-tuning (adstock/saturatie/priors per kanaal — een eigen, volwaardige stap, geen bijzaak) en modelspecificatie voorstellen voor de bevroren, geteste statistische kern (mmm-core). Jij verzint nooit de statistische wiskunde zelf — je kiest alleen instellingen die de kern gebruikt. Blijf ook zelf onderwerp-voor-onderwerp praten: behandel bijvoorbeeld eerst adstock voor een kanaal, dan pas saturatie, in plaats van alles in één alinea te proppen.

Stap 1 — Data voorbereiden (vóórdat er gemodelleerd wordt):
Meerdere ruwe bestanden moeten worden samengevoegd tot één wekelijkse master-tabel voordat er iets gefit kan worden. Jouw taak hier is een concreet SAMENVOEG-RECEPT voorstellen met de tool "propose_prepare_recipe": per bestand eventuele opschoon-/hervorm-bewerkingen, de datumkolom en per kolom de rol ("kpi"/"spend"/"control") — dezelfde rollen als in stap 2, maar hier gaat het puur om het samenvoegen, nog niet om het model. Regels voor dit recept:
- Ruwe data opschonen/hervormen ("transforms" per bestand): je hebt volledige ruimte om elk bestand eerst fit-klaar te maken, met een reeks getypeerde bewerkingen die vóór de roltoewijzing draaien (in volgorde; een latere bewerking ziet het resultaat van de vorige). Beschikbaar: "rename" (kolom hernoemen), "drop_columns", "filter_rows" (rijen houden op een voorwaarde), "drop_duplicates", "scale" (lineair omrekenen — centen→euro's, valutakoers, andere eenheid), "combine" (kolommen optellen/vermenigvuldigen/plakken), "split" (een samengestelde kolom splitsen), "recode" (categoriewaarden hermappen/typfouten herstellen), "parse_date" (een dubbelzinnig of niet-standaard datumformaat forceren met een format-string of dayfirst), "pivot" (een 'lang' bestand met kolommen als week/kanaal/spend omzetten naar 'breed' met één kolom per kanaal). Stel alleen bewerkingen voor die je op basis van de voorbeeldrijen daadwerkelijk nodig acht, en leg in "reasoning" uit waarom. Kolomnamen die je in de rollen of als datumkolom gebruikt, verwijzen naar de namen ná de bewerkingen.
- Rol ("role") per kolom: "kpi" voor de doelvariabele, "spend" voor marketinguitgaven/-volume per kanaal (ook niet-monetair, zoals e-mailverzendingen), "control" voor overige verklarende variabelen (bijvoorbeeld prijs) die geen eigen kanaal-effect krijgen.
- Voor een "control"-kolom mag je een "fill"-strategie voorstellen ("zero"/"ffill"/"bfill"/"interpolate"/"mean"/"median") als je verwacht dat er gaten in zitten; laat 'm weg als je dat niet weet — dan blijft een gat gewoon zichtbaar in het kwaliteitsrapport in plaats van dat je iets verzint.
- Zie je in de voorbeeldrijen een duidelijke uitschieter in één specifieke week? Stel een "event_dummies"-item voor (naam + ISO-jaar/weeknummer).
- Afgeleide variabelen ("features"): naast de ruwe kolommen kun je nieuwe verklarende kolommen láten berekenen uit bestaande kolommen — ze worden als control toegevoegd aan de master en kun je later in de modelstap als control gebruiken. Beschikbare bewerkingen: "lag" (vertraagd effect, bv. prijs van vorige week), "rolling_mean"/"rolling_sum" (gladstrijken/optellen over een venster), "diff" (weekverschil), "ratio" (aandeel, bv. eigen spend / totale spend — veilig bij deling door 0), "product" (interactie tussen twee kolommen), "sum" (totaal van meerdere kolommen, bv. totale spend), "log1p" (heavy tail temperen), "zscore" (standaardiseren), "winsorize" (uitschieters knippen), "recurring_week_dummy" (1 op ISO-weken die elk jaar terugkomen, bv. Black Friday week 48). Grondregel: stel alleen een feature voor met een concrete, uitlegbare reden (in "reasoning"); verzin geen variabelen zonder onderbouwing. Gebruik unieke snake_case-namen; "inputs" moeten bestaande kolom-outputnamen zijn; features mogen op elkaar voortbouwen (volgorde telt). Interacties/ratio's zijn vooral zinvol als je een echt vermoeden hebt (bv. dat prijs het effect van een kanaal moduleert), niet als standaard-toevoeging.
- Gebruik voor "storage_path" ALTIJD exact het pad dat je in de contextsectie per bestand hebt gekregen — verzin nooit een eigen pad.
- Elke aanroep van "propose_prepare_recipe" is een VOLLEDIG recept, nooit een gedeeltelijke aanvulling: "sources" bevat ALTIJD alle bestanden met al hun kolommen, ook wanneer je alleen naar aanleiding van een vervolgvraag iets kleins toevoegt of wijzigt (bijvoorbeeld één extra "event_dummies"-item). Er bestaat geen manier om alleen het verschil door te geven — herhaal dus de eerder goedgekeurde "sources" ongewijzigd (zelfde bestanden, kolommen, transforms) en verander alleen het onderdeel waar de vraag over ging. Een recept met een lege of ontbrekende "sources" wordt afgewezen.
- Zodra het recept is gecontroleerd (de gebruiker heeft op "Controleer & voeg samen" geklikt), krijg je een sectie "Data-voorbereiding" met het kwaliteitsrapport en een preview van het resultaat. Bespreek dat in gewone taal: welke periode, welke bijzonderheden (bijna-identieke kanalen, gaten, opvallende weken), en stel alleen een NIEUW recept voor als er echt iets moet veranderen — herhaal nooit klakkeloos een recept dat al is goedgekeurd of dat net gefaald is zonder de oorzaak aan te pakken.
- Het kwaliteitsrapport bevat "kpi_outlier_weeks" en "year_end_anomaly"-meldingen die de exacte week(en) én waarde(n) van een uitschieter noemen (de voorbeeldrijen zelf tonen alleen de eerste/laatste weken, dus een uitschieter kan daarbuiten vallen zonder dat je 'm ziet). Zie je zo'n melding, benoem dan DIRECT de specifieke week + waarde uit de melding zelf (niet "is er misschien een uitschieter?" maar bijvoorbeeld "week 2025-W45 (2025-11-03) heeft 1331, veel hoger dan de weken ervoor/erna — dat lijkt een eenmalige piek") en stel meteen een concreet "event_dummies"-item voor die week voor.
- Mislukte samenvoeging (bijv. "geen overlappende periode"): lees de foutmelding letterlijk, achterhaal welke bron de periode inperkt of welke kolom fout staat, en stel een gecorrigeerd recept voor.

Stap 2 — Modelconfiguratie (nadat de dataset is goedgekeurd):
- Baseer elke keuze op wat je daadwerkelijk in de kolomnamen en voorbeeldrijen ziet. Verzin geen zakelijke context die er niet is.
- Kanaaltype ("channel_type"): "intent" voor kanalen die al bestaande koopintentie vangen (zoekwoorden op eigen merknaam, marktplaatsen, iemand die al actief zoekt), "brand" voor kanalen die vooral nieuwe aandacht/vraag opbouwen (social ads, prospecting, display), "generic" als je het niet zeker weet.
- Na-ijlvorm ("adstock"): "geometric" (standaard) voor digitale kanalen, waarbij het effect direct piekt en daarna afneemt. Kies "delayed" alleen voor offline/merkkanalen die pas na een paar weken hun piek bereiken (tv, radio, out-of-home, soms video) — het effect bouwt op en dooft daarna uit.
- Verzadigingsvorm ("saturation"): "hill" (standaard) is flexibel en kan een S-curve aan. Kies "logistic" als er weinig of ruisige data is; die vorm heeft één parameter minder en is dan robuuster.
- Ruismodel ("likelihood") op modelniveau: "normal" (standaard) voor een continue KPI (omzet). Kies "student_t" als die KPI duidelijke uitschieters/pieken heeft. Kies "poisson" of "negative_binomial" als de KPI een telling is met láge aantallen per week (bijv. 5–50 leads) — dan modelleren we op tellingen i.p.v. een normale verdeling. Gebruik "negative_binomial" i.p.v. "poisson" als de tellingen sterker schommelen dan een Poisson toelaat (overdispersie). Tellingsmodellen alleen bij hele getallen ≥ 0.
- Trendvorm ("trend_type") op modelniveau: "linear" (standaard, één rechte trend). Kies "piecewise" als de basislijn duidelijk van richting verandert in de periode (een structurele knik/versnelling/vertraging, bijv. na een herpositionering of marktverandering) — dan mag de trend op een paar punten buigen.
- Wees expliciet over onzekerheid. Als een kolomnaam meerdere interpretaties toelaat (bijvoorbeeld "google_sales" kan een campagnenaam zijn, geen garantie), zeg dat in "reasoning" — dit gaat naar een mens die het kan corrigeren voordat er iets draait.
- Is er een goedgekeurde dataset, gebruik dan bij voorkeur die ene samengevoegde master-tabel als bron in plaats van de losse ruwe bestanden opnieuw te mappen.
- Gebruik de tool "propose_model_config" pas zodra je een concreet, verdedigbaar voorstel hebt.

Stap 2 — parameter-tuning (eigen, volwaardige stap — priors staan centraal, geen bijzaak):
Dit is Bayesiaanse tuning, geen ridge-regressie: elk veld hieronder is een PRIOR, niet een hard minimum/maximum. Framing die je altijd aanhoudt: "wat verwacht je, en hoe zeker ben je daarvan?" — nooit "wat is de ondergrens/bovengrens?". Grondregel blijft: laat elk fijnafstem-veld helemaal WEG tenzij je een concrete, uitlegbare reden hebt — weglaten betekent "gebruik de geteste standaard, met zijn eigen ingebouwde onzekerheid". Behandel dit onderwerp-voor-onderwerp per kanaal (eerst adstock, dan saturatie, dan effectgrootte), niet alles tegelijk.
- Adstock (na-ijl) per kanaal: functievorm ("adstock": "geometric"/"delayed") plus de priors op de vertraging — "adstock_concentration" (hoger pint de halfwaardetijd dichter bij je verwachting), "l_max" (maximale carry-over in weken, standaard 12), "expected_half_life" (verwachte halfwaardetijd, alleen bij concrete kennis), en bij "delayed" ook "delayed_peak_weeks"/"delayed_peak_sigma" (wanneer piekt het, en hoe zeker ben je).
- Saturatie (afnemend rendement) per kanaal: functievorm ("saturation": "hill"/"logistic") plus de priors op vorm en halfverzadiging — "hill_slope_a/b" en "halfsat_a/b" bij Hill, "logistic_lam_sigma" bij logistic.
- Coëfficiënt-prior per kanaal ("beta_sigma", HalfNormal): hoe groot verwacht je het effect, en hoe zeker ben je? Onderbouw waar mogelijk met een ROAS-benchmark uit de branche of een eerder experiment — kleiner = sterkere "dit kanaal doet weinig"-prior.
- Kalibratie ("calibration" per kanaal, "roas"+"sd"): alleen invullen als de gebruiker een echt lift-/geo-experiment heeft. Dit trekt de schatting zacht naar het experiment; zonder experiment helemaal weglaten.
- Baseline-priors (model-niveau, "priors"): "intercept_sigma" (baseline), "noise_sigma" (observatieruis), "trend_sigma"/"changepoint_scale" (trend), "season_sigma" (seizoen), "control_sigma" (overige variabelen). Seizoen als afgeleide feature: "seasonality_periods" (52 = jaarlijks, 26 = halfjaarlijks; null = expliciet uit — het enige veld waar null iets anders betekent dan weglaten) en "n_fourier_modes" (standaard 2; laag houden bij weinig data). Trend-flexibiliteit bij "piecewise": "n_changepoints" (standaard 6; meer = flexibeler maar gevoeliger voor divergenties).
- Ruismodel: "student_t_nu" (lager = zwaardere staarten, > 2) alleen bij likelihood="student_t".
- Hiërarchische priors (pooling over regio's/producten): mmm-core ondersteunt dit in de statistische kern, maar dat is NIET aangesloten op deze wizard/tool — stel dit dus niet voor als optie; als de gebruiker meerdere regio's noemt, leg uit dat één samengevoegde master-tabel wordt gebruikt.
- Prior predictive check: vóórdat er een echte fit draait, kan de gebruiker een goedkope prior-predictive-controle draaien (geen MCMC) die laat zien wat de gekozen priors betekenen voor het KPI-bereik. Lees het resultaat als het je wordt gegeven ("Prior-predictive check" in de context) en reageer erop: sluiten de priors het werkelijke bereik in (te strak = verruimen), of zijn ze absurd breed (aanscherpen)? Adviseer expliciet vóór er compute aan een echte fit wordt gespendeerd.

Extra ogen op de data (gebruik deze actief):
- Per bestand krijg je naast de eerste regels ook een VOLLEDIGE-REEKS-PROFIEL (min/max/gemiddelde/sd, ontbrekende weken + langste gat, uitschieters mét week+waarde over de héle periode, en sterk gecorreleerde kolommen). De preview toont alleen de eerste rijen; het profiel ziet alles. Benoem een uitschieter of gat uit het profiel concreet (week + waarde) en stel er meteen iets voor — verwijs niet naar "misschien een piek".
- Sterk gecorreleerde kolommen (hoge r) in het profiel wijzen op bijna-identieke kanalen of een control die een kanaal spiegelt: het model kan die niet los schatten. Benoem het en stel voor er één weg te laten of te combineren.
- Per bestand kan er een voorlopige KOLOM-CLASSIFICATIE staan (rol, eenheid, granulariteit, breed/lang). Gebruik die als startpunt, maar controleer 'm tegen de kolomnamen en het profiel; corrigeer als iets niet klopt.
- Er kan een DIEPE DATA-INSPECTIE-sectie zijn (Claude heeft de data zelf met pandas verkend). Neem die bevindingen serieus mee in je voorstellen; ze zijn op de volledige data gebaseerd.
- Je krijgt een lijst met terugkerende NL-kalendergebeurtenissen. Zie je in de KPI een patroon rond zo'n week, stel dan een 'recurring_week_dummy'-feature of event-dummy voor.

Zakelijke context ophalen (prior-elicitatie — dit maakt een Bayesiaans model sterker):
- Priors, kalibratie en channel_type worden veel beter als je weet wat er achter de data zit. Wacht daar niet passief op: vraag de gebruiker proactief naar branche, seizoensdrukte, bekende campagnes/acties, offline-kanalen met lange nawerking (tv/radio/OOH) en of er ooit een lift-/geo-experiment is gedaan (gemeten ROAS + onzekerheid).
- Zodra de gebruiker zulke feiten geeft, leg ze vast met de tool "record_business_context" (per feit een topic + de feitelijke inhoud, en waar het op slaat). Vertaal ze daarna naar concrete config: offline-kanaal → adstock "delayed" + hogere l_max; bekende halfwaardetijd → expected_half_life; gemeten experiment → calibration (roas + sd); sterk seizoen → seizoen aan.
- Verzin geen context; leg alleen vast wat de gebruiker daadwerkelijk zegt. Vraag één of twee gerichte dingen tegelijk, niet een hele vragenlijst.

Algemeen:
- Roep pas een tool aan zodra je zeker genoeg bent. Heb je eerst meer info nodig (bijvoorbeeld: geen enkel bestand is geüpload) — antwoord dan gewoon met tekst en stel een vraag.
- Antwoord in het Nederlands, kort en zonder onnodig jargon (zie de schrijfregels bovenaan).
- Wees een proactieve marketing-analist, geen passieve datamachine: wacht niet tot de gebruiker een specifieke vraag stelt. Zie je in de voorbeeldrijen of het kwaliteitsrapport een duidelijk patroon — een jaarlijkse piek (kerst, Black Friday), een kanaal met een vermoedelijk lange na-ijl (tv/radio/out-of-home), een paar rijen die een uitschieter lijken, een kanaal dat een ander kanaal lijkt te moduleren — benoem dat expliciet en stel concreet voor wat je zou doen (een "features"-item, een "event_dummies"-item, een aangepaste "channel_type"/"adstock", een "priors"-aanpassing), met je redenering erbij. Wacht op een "ja, doe dat" van de gebruiker voordat je de tool aanroept met die aanpassing verwerkt — stel niet zomaar iets voor zonder duidelijke aanleiding in de data.

Resultaten lezen en verbeteren:
Zodra er een fit is gedraaid, krijg je in de context een sectie "Laatste fit / resultaten". Dan is je taak niet alleen voorstellen, maar ook uitleggen en verbeteren. Vat in gewone taal samen wat de uitkomst zegt (welke kanalen werken, wat de baseline is, of het model betrouwbaar is), noem eerlijk de onzekerheid, en als er iets mis of te verbeteren is: leg de vermoedelijke oorzaak uit én roep de tool aan met een concrete, aangepaste configuratie die de gebruiker met één klik kan overnemen.

De validatiestap na een fit splitst in TWEE lagen — leid je diagnose altijd langs dat onderscheid, want de remedie verschilt:

Laag 1 — sampler-betrouwbaarheid (is het wel goed gesampled? R-hat, ESS, divergenties, tracekwaliteit) → de oplossing zit in TUNING/MODELSPECIFICATIE, nooit in de data:
- Hoge R-hat (> 1.1) en/of veel divergenties: het model is te complex voor deze data of de sampler-instellingen zijn te licht. Vereenvoudig — minder Fourier-modes (n_fourier_modes omlaag), zet trend uit of hou 'm linear i.p.v. piecewise, verkrap een te vlakke prior (kleinere beta_sigma), of laat een zwak kanaal weg. Adviseer daarnaast in tekst een hogere target_accept of meer tuning-steps (sampler-instelling, niet in de tool).
- Lage effectieve steekproef (ESS): vaak een teken van sterke correlatie tussen parameters (bv. twee bijna-identieke kanalen) — vereenvoudig of combineer kanalen.

Laag 2 — modelfit & plausibiliteit (is de uitkomst inhoudelijk goed? R², MAPE, dekking, decompositie, aannemelijkheid per kanaal) → de oplossing zit in DATA-INSPECTIE/-VOORBEREIDING, niet in de sampler:
- Fit MISLUKT vóór het samplen (data-kwaliteitsfout): lees de foutmelding letterlijk. "Geen overlappende periode" → controleer welke bron de periode inkort; "ontbrekende kolom" of "control bevat NaN" → corrigeer de kolomrol, laat de control weg of geef 'm een fill-strategie. Stel de gecorrigeerde config voor.
- Een kanaal krijgt een onwaarschijnlijk hoog aandeel of ROAS: mogelijk confounding of een ontbrekende verklarende variabele. Stel voor een control toe te voegen, of — als de gebruiker een lift/geo-experiment heeft — voeg een "calibration" (roas + sd) toe aan dat kanaal in de config.
- Lage voorspellende dekking of losse uitschieterweken die het model meesleuren: overweeg "student_t", of een event-dummy voor die specifieke week (terug naar data-voorbereiding).
- Slechte generalisatie als er cross-validatie is gedraaid (out-of-sample veel slechter dan in-sample): vereenvoudig het model of controleer op een ontbrekende variabele.

- Herhaal nooit klakkeloos dezelfde config die net faalde of "warn" gaf — verander gericht wat de diagnose aanwijst, zeg wat je veranderde en waarom, én benoem expliciet welke laag (sampler of fit) je aanpassing adresseert zodat de gebruiker weet welke stap ("terug naar tuning" of "terug naar data") hij moet gebruiken.`;

// Elicited business context, recorded via the record_business_context tool and turned into
// priors/calibration/channel_type — the highest-leverage input a Bayesian model has.
const RECORD_CONTEXT_TOOL: Anthropic.Tool = {
  name: "record_business_context",
  description:
    "Leg geëliciteerde zakelijke context vast (branche + losse feiten) die je later naar priors/kalibratie/channel_type vertaalt. Roep dit pas aan als de gebruiker je concrete feiten heeft gegeven — verzin niets.",
  input_schema: {
    type: "object",
    properties: {
      industry: { type: "string", description: "Branche/sector van de klant, indien genoemd." },
      notes: {
        type: "array",
        description: "Losse, feitelijke stukjes context zoals de gebruiker ze gaf.",
        items: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              enum: ["branche", "seizoen", "campagne", "offline_kanaal", "experiment", "prijs", "overig"],
            },
            fact: { type: "string", description: "Het feit zelf, in gewone taal." },
            relates_to: { type: "string", description: "Kanaal/kolom waar het op slaat, indien van toepassing." },
          },
          required: ["topic", "fact"],
          additionalProperties: false,
        },
      },
    },
    required: ["notes"],
    additionalProperties: false,
  },
};

interface ProjectDataContext {
  sources: { file: SourceFile; preview: string | null }[];
  dataset: ArchitectDatasetContext;
  fit: ArchitectFitContext;
  businessContext: ProjectContext | null;
  inspection: DataInspection | null;
}

// Narrow the record_business_context tool input into typed notes for persistence.
export function parseBusinessContextInput(
  input: unknown,
): { industry: string | null; notes: BusinessContextNote[] } | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const rawNotes = Array.isArray(raw.notes) ? raw.notes : [];
  const notes: BusinessContextNote[] = [];
  const topics = ["branche", "seizoen", "campagne", "offline_kanaal", "experiment", "prijs", "overig"];
  for (const n of rawNotes) {
    if (!n || typeof n !== "object") continue;
    const rn = n as Record<string, unknown>;
    if (typeof rn.fact !== "string") continue;
    notes.push({
      topic: (topics.includes(rn.topic as string) ? rn.topic : "overig") as BusinessContextNote["topic"],
      fact: rn.fact,
      relates_to: typeof rn.relates_to === "string" ? rn.relates_to : null,
    });
  }
  if (notes.length === 0 && typeof raw.industry !== "string") return null;
  return { industry: typeof raw.industry === "string" ? raw.industry : null, notes };
}

function buildDataContextBlock(ctx: ProjectDataContext): string {
  if (ctx.sources.length === 0) {
    return "Er zijn nog geen bestanden geüpload voor dit project. Vraag de gebruiker om eerst data te uploaden.";
  }
  const parts = ctx.sources.map(({ file, preview }) => {
    const header = `Bestand "${file.name}" — storage_path: "${file.storage_path}"`;
    const mappingBlock = formatColumnMappingBlock(file.mapping);
    const profileBlock = formatSourceProfileBlock(file.profile);
    const extras = [mappingBlock, profileBlock].filter(Boolean).join("\n");
    if (preview === null) {
      const binary = `${header}\n(binair bestand — geen tekstpreview beschikbaar; vraag de gebruiker om de kolomnamen te noemen als je ze nodig hebt)`;
      return extras ? `${binary}\n${extras}` : binary;
    }
    return [`${header}\nEerste regels van het bestand:\n${preview}`, extras].filter(Boolean).join("\n");
  });
  return `Geüploade bronbestanden voor dit project:\n\n${parts.join("\n\n")}`;
}

// The PrepareRecipe shape (mirrors mmm_worker.jobspec.parse_prepare_config +
// lib/types.ts's PrepareRecipe): which raw files, mapped to which column roles, merge
// into the one master table. No model settings — that is a separate, later tool.
const PROPOSE_PREPARE_RECIPE_TOOL: Anthropic.Tool = {
  name: "propose_prepare_recipe",
  description:
    "Stel een concreet samenvoeg-recept voor: welke bestanden, met welke datumkolom, welke rol per kolom, plus optionele afgeleide variabelen (features), om tot één wekelijkse master-tabel te komen. Roep dit pas aan als je zeker genoeg bent; nog niet klaar om te fitten, alleen om samen te voegen en te controleren.",
  input_schema: {
    type: "object",
    properties: {
      reasoning: {
        type: "string",
        description:
          "Korte, voor de gebruiker leesbare uitleg van de mapping-keuzes — inclusief expliciete onzekerheden die gecontroleerd moeten worden.",
      },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Korte naam voor deze bron, bv. 'weekly_data'." },
            storage_path: { type: "string" },
            // Optional fields: omit rather than send an explicit null. Anthropic's strict-schema
            // compiler caps the number of nullable/union-typed parameters per request at 16 —
            // every one of these previously used `type: [".., "null"]` purely to mean "use the
            // default", which "field absent" already means just as well (the worker's .get(key)
            // treats a missing key and an explicit null identically), so there is nothing to gain
            // from the union type here. Keep union types reserved for fields where null carries a
            // DIFFERENT meaning than omission (see seasonality_periods in propose_model_config).
            date_column: { type: "string", description: "Laat weg om automatisch te detecteren." },
            columns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  role: { type: "string", enum: ["kpi", "spend", "control"] satisfies ColumnRole[] },
                  output_name: { type: "string", description: "Laat weg om de originele kolomnaam te gebruiken." },
                  fill: {
                    type: "string",
                    enum: ["zero", "ffill", "bfill", "interpolate", "mean", "median"] satisfies FillStrategy[],
                    description: "Alleen voor 'control'-kolommen: hoe ontbrekende weken te vullen. Laat weg om niet te vullen (gat blijft zichtbaar).",
                  },
                },
                required: ["name", "role"],
                additionalProperties: false,
              },
            },
            transforms: {
              type: "array",
              description:
                "Ruwe opschoon-/hervorm-bewerkingen op DIT bestand, in volgorde, VÓÓR de roltoewijzing. Gebruik dit om een bestand fit-klaar te maken. Laat leeg als het bestand al netjes is (één rij per week/dag, aparte kolommen per kanaal, eenduidige datum). Verzin nooit een bewerking zonder aanleiding in de voorbeeldrijen.",
              items: {
                type: "object",
                properties: {
                  op: {
                    type: "string",
                    enum: [
                      "rename",
                      "drop_columns",
                      "filter_rows",
                      "drop_duplicates",
                      "scale",
                      "combine",
                      "split",
                      "recode",
                      "parse_date",
                      "pivot",
                    ] satisfies TransformOp[],
                    description:
                      "Bewerking. Parameters (in 'params'): rename {from, to}; drop_columns {columns:[..]}; filter_rows {column, compare:eq|ne|lt|le|gt|ge|in|not_in|contains, value of values:[..]}; drop_duplicates {subset?:[..]}; scale {column, factor, offset?} (bv. centen→euro's factor 0.01, of valutakoers); combine {columns:[..], into, how:sum|product|concat, sep?}; split {column, into_columns:[..], sep}; recode {column, mapping:[{from,to}], default?}; parse_date {column, format? (bv. \"%d/%m/%Y\"), dayfirst?} — gebruik dit om een dubbelzinnig datumformaat te forceren; pivot {index, columns, values, aggfunc:sum|mean} — zet een 'lang' bestand (kolommen week/kanaal/spend) om naar 'breed' (één kolom per kanaal).",
                  },
                  params: {
                    type: "object",
                    description: "Parameters horend bij 'op' (zie de opsomming bij 'op'). Alleen de relevante velden invullen.",
                  },
                },
                required: ["op", "params"],
              },
            },
          },
          required: ["name", "storage_path", "columns"],
          additionalProperties: false,
        },
      },
      event_dummies: {
        type: "array",
        description:
          "0/1-controlekolommen voor specifieke ISO-weken met een duidelijke, in de data zichtbare uitschieter. Leeg laten als er geen zijn.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Kolomnaam, bv. 'dummy_2025w45'." },
            weeks: {
              type: "array",
              description: "Lijst van [iso_jaar, iso_weeknummer]-paren waarop deze dummy 1 is.",
              items: { type: "array", items: { type: "integer" } },
            },
          },
          required: ["name", "weeks"],
          additionalProperties: false,
        },
      },
      features: {
        type: "array",
        description:
          "Afgeleide variabelen die tijdens de samenvoeging worden berekend uit bestaande master-kolommen en als control-kolom worden toegevoegd (lags, voortschrijdend gemiddelde, ratio's/aandelen, interacties, transformaties, terugkerende kalender-dummy's). Leeg laten als er geen zijn.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Naam van de nieuwe kolom, snake_case, uniek. Bv. 'google_lag1' of 'spend_share'." },
            op: {
              type: "string",
              enum: [
                "lag",
                "rolling_mean",
                "rolling_sum",
                "diff",
                "ratio",
                "product",
                "sum",
                "log1p",
                "zscore",
                "winsorize",
                "recurring_week_dummy",
              ] satisfies FeatureOp[],
              description:
                "Bewerking: lag (verschuiven), rolling_mean/rolling_sum (venster), diff (weekverschil), ratio (a/b, veilig bij 0), product/sum (interactie of totaal van 2+ kolommen), log1p, zscore, winsorize (uitschieters knippen), recurring_week_dummy (1 op ISO-weken, elk jaar).",
            },
            inputs: {
              type: "array",
              items: { type: "string" },
              description:
                "Bestaande master-kolomnamen die deze feature gebruikt. Precies 1 voor unaire ops (lag/rolling/diff/log1p/zscore/winsorize), precies 2 voor ratio (teller, noemer), 2+ voor product/sum, leeg voor recurring_week_dummy.",
            },
            params: {
              type: "object",
              description: "Bewerkings-parameters; laat de niet-gebruikte weg.",
              properties: {
                weeks: { type: "integer", description: "lag: aantal weken verschuiven (≥1); diff: aantal weken verschil (standaard 1)." },
                window: { type: "integer", description: "rolling_mean/rolling_sum: venstergrootte in weken (≥1)." },
                lower_q: { type: "number", description: "winsorize: onderste kwantiel om op te knippen (bv. 0.01)." },
                upper_q: { type: "number", description: "winsorize: bovenste kwantiel (bv. 0.99)." },
                iso_weeks: {
                  type: "array",
                  items: { type: "integer" },
                  description: "recurring_week_dummy: ISO-weeknummers die elk jaar op 1 staan (bv. [48] voor Black Friday).",
                },
              },
              additionalProperties: false,
            },
          },
          required: ["name", "op", "inputs", "params"],
          additionalProperties: false,
        },
      },
    },
    required: ["reasoning", "sources", "event_dummies", "features"],
    additionalProperties: false,
  },
  // Not `strict`: the per-source `transforms[].params` are a free-form object (their shape
  // depends on `op`), which strict-mode's additionalProperties:false forbids. The worker
  // (jobspec.py + mmm-core) validates every op and its params, and the builder reviews the
  // proposed recipe before it runs, so the schema here is guidance rather than enforced.
};

// The full JobConfig shape (mirrors worker/mmm_worker/jobspec.py + lib/types.ts),
// minus `sample` — the wizard applies its own default draws/tune/chains rather than
// letting the model pick compute cost.
const PROPOSE_CONFIG_TOOL: Anthropic.Tool = {
  name: "propose_model_config",
  description:
    "Stel een concrete modelconfiguratie voor op basis van de geziene brondata. Roep dit pas aan als je zeker genoeg bent om een compleet voorstel te doen.",
  input_schema: {
    type: "object",
    properties: {
      reasoning: {
        type: "string",
        description:
          "Korte, voor de gebruiker leesbare uitleg van de keuzes — inclusief expliciete onzekerheden/aannames die gecontroleerd moeten worden.",
      },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Korte naam voor deze bron, bv. 'weekly_data'." },
            storage_path: { type: "string" },
            date_column: { type: "string", description: "Laat weg om automatisch te detecteren." },
            columns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  role: { type: "string", enum: ["kpi", "spend", "control"] satisfies ColumnRole[] },
                  output_name: { type: "string", description: "Laat weg om de originele kolomnaam te gebruiken." },
                },
                required: ["name", "role"],
                additionalProperties: false,
              },
            },
          },
          required: ["name", "storage_path", "columns"],
          additionalProperties: false,
        },
      },
      model: {
        type: "object",
        properties: {
          kpi: { type: "string", description: "De output_name (of name) van de KPI-kolom." },
          channels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                channel_type: { type: "string", enum: ["intent", "brand", "generic"] satisfies ChannelType[] },
                adstock: {
                  type: "string",
                  enum: ["geometric", "delayed"] satisfies AdstockType[],
                  description: "'geometric' (standaard, digitaal) of 'delayed' (offline/merk, piek na enkele weken).",
                },
                saturation: {
                  type: "string",
                  enum: ["hill", "logistic"] satisfies SaturationType[],
                  description: "'hill' (standaard) of 'logistic' (robuuster bij weinig/ruisige data).",
                },
                l_max: {
                  type: "integer",
                  description:
                    "Maximale na-ijl-duur (weken) van dit kanaal. Laat weg voor de standaard (12). Verhoog voor merk/offline-kanalen met lange carry-over, verlaag voor puur intent.",
                },
                expected_half_life: {
                  type: "number",
                  description:
                    "Verwachte halfwaardetijd (weken) van het na-ijl-effect als je daar concrete kennis over hebt; laat weg om het kanaaltype de prior te laten bepalen.",
                },
                priors: {
                  type: "object",
                  description:
                    "Fijnafstemming van de kanaal-priors. Zet alleen een veld als je een reden hebt; laat de rest weg (= mmm-core-standaard).",
                  properties: {
                    beta_sigma: { type: "number", description: "HalfNormal-schaal op het kanaaleffect; kleiner = sterkere 'dit kanaal doet weinig'-prior." },
                    adstock_concentration: { type: "number", description: "Concentratie van de retentie-prior; hoger pint de halfwaardetijd dichter bij de verwachting." },
                    delayed_peak_weeks: { type: "number", description: "Prior-centrum voor de piek-lag (delayed adstock)." },
                    delayed_peak_sigma: { type: "number", description: "Prior-schaal voor de piek-lag." },
                    hill_slope_a: { type: "number", description: "Gamma(a,b)-prior op de Hill-helling — a." },
                    hill_slope_b: { type: "number", description: "Gamma(a,b)-prior op de Hill-helling — b." },
                    halfsat_a: { type: "number", description: "Beta(a,b)-prior op het Hill-halfverzadigingspunt — a." },
                    halfsat_b: { type: "number", description: "Beta(a,b)-prior op het Hill-halfverzadigingspunt — b." },
                    logistic_lam_sigma: { type: "number", description: "HalfNormal-schaal op de logistische steilheid." },
                  } satisfies Record<keyof ChannelPriors, unknown>,
                  additionalProperties: false,
                },
                calibration: {
                  type: "object",
                  description:
                    "Experimenteel gemeten ROAS (uit een lift-/geo-test) om dit kanaal aan te kalibreren. Alleen invullen als de gebruiker een echt experiment heeft; anders helemaal weglaten.",
                  properties: {
                    roas: { type: "number", description: "Gemeten incrementele ROAS (KPI per eenheid spend), ≥ 0." },
                    sd: { type: "number", description: "Onzekerheid (standaarddeviatie) op die meting, > 0. Kleiner = vertrouw het experiment meer." },
                  },
                  required: ["roas", "sd"],
                  additionalProperties: false,
                },
              },
              required: ["name", "channel_type", "adstock", "saturation"],
              additionalProperties: false,
            },
          },
          control_columns: { type: "array", items: { type: "string" } },
          add_trend: { type: "boolean" },
          trend_type: {
            type: "string",
            enum: ["linear", "piecewise"] satisfies TrendType[],
            description: "'linear' (standaard) of 'piecewise' bij een duidelijke structurele knik in de basislijn.",
          },
          n_changepoints: {
            type: "integer",
            description:
              "Aantal knikpunten voor een 'piecewise' trend (genegeerd bij 'linear'). Laat weg voor de standaard (6). Meer = flexibeler, maar hogere kans op overfitting/divergenties.",
          },
          // The one deliberately nullable/union-typed field left in these two tools: null here
          // means "season explicitly off", which is a different instruction than omitting the
          // field (== keep the tested default, season on at 52). Every other optional field in
          // both tools uses plain omission instead, to stay well under Anthropic's 16-parameter
          // cap on nullable/union-typed schema fields per request (see the comment above
          // `date_column` in propose_prepare_recipe for the full story — we hit that limit with
          // ~35 nullable fields and this is the fix).
          seasonality_periods: {
            type: ["number", "null"],
            description:
              "Lengte van de seizoenscyclus in weken als afgeleide feature (52 = jaarlijks, 26 = halfjaarlijks). null = seizoen expliciet uit. Laat weg voor de standaard (52, seizoen aan). Zet aan als de KPI een terugkerend patroon heeft.",
          },
          n_fourier_modes: {
            type: "integer",
            description:
              "Aantal Fourier-paren voor de seizoensterm — hoe fijn het seizoenspatroon mag zijn. Laat weg voor de standaard (2). Meer modes = grilliger seizoen (voorzichtig bij weinig data).",
          },
          likelihood: {
            type: "string",
            enum: ["normal", "student_t", "poisson", "negative_binomial"] satisfies LikelihoodType[],
            description:
              "'normal' (standaard, continue KPI), 'student_t' (uitschieters), 'poisson'/'negative_binomial' (lage-aantallen tellingen zoals leads).",
          },
          student_t_nu: {
            type: "number",
            description:
              "Vrijheidsgraden voor de student_t-likelihood (lager = zwaardere staarten / robuuster tegen uitschieters, moet > 2). Laat weg voor de standaard (4). Alleen relevant bij likelihood='student_t'.",
          },
          priors: {
            type: "object",
            description:
              "Fijnafstemming van de basislijn-priors (intercept, trend, seizoen, controls, ruis). Zet alleen een veld met een reden; laat de rest weg (= standaard).",
            properties: {
              intercept_sigma: { type: "number", description: "Normal-schaal op het intercept." },
              trend_sigma: { type: "number", description: "Normal-schaal op de trendhelling." },
              season_sigma: { type: "number", description: "Normal-schaal op elke Fourier-seizoenscoëfficiënt." },
              control_sigma: { type: "number", description: "Normal-schaal op elke control-coëfficiënt." },
              noise_sigma: { type: "number", description: "HalfNormal-schaal op de observatieruis." },
              changepoint_scale: { type: "number", description: "Laplace-schaal per knikpunt bij piecewise trend; kleiner = stuggere trend." },
            } satisfies Record<keyof BaselinePriors, unknown>,
            additionalProperties: false,
          },
        },
        required: ["kpi", "channels", "control_columns", "add_trend", "trend_type", "seasonality_periods", "likelihood"],
        additionalProperties: false,
      },
      event_dummies: {
        type: "array",
        description:
          "0/1-controlekolommen voor specifieke ISO-weken met een duidelijke, in de data zichtbare uitschieter (storing, eenmalige actie). Leeg laten als er geen zijn.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Kolomnaam, bv. 'dummy_2025w45'." },
            weeks: {
              type: "array",
              description:
                "Lijst van [iso_jaar, iso_weeknummer]-paren waarop deze dummy 1 is (elk paar exact 2 gehele getallen).",
              items: { type: "array", items: { type: "integer" } },
            },
          },
          required: ["name", "weeks"],
          additionalProperties: false,
        },
      },
    },
    required: ["reasoning", "sources", "model", "event_dummies"],
    additionalProperties: false,
  },
  // Not `strict`: strict mode requires every property to be listed in `required` (its whole
  // validation guarantee depends on that), which is incompatible with the optional (omit-to-
  // default) tuning fields above — and those fields being genuinely optional rather than
  // nullable-and-required is exactly what keeps this tool under Anthropic's 16-parameter cap
  // on nullable/union-typed schema fields per request. mmm-core/jobspec.py validates every
  // field at run time regardless, and the builder reviews the proposed config before it runs.
};

export function buildRequest(
  ctx: ProjectDataContext,
  history: Anthropic.MessageParam[],
): Anthropic.MessageCreateParamsNonStreaming {
  const dataContext = buildDataContextBlock(ctx);
  const datasetContext = formatDatasetContextBlock(ctx.dataset);
  const resultsContext = formatFitContextBlock(ctx.fit);

  // Model routing: config role for the bounded "propose a recipe/config from data"
  // tasks; analyst role once there is something to actually reason about — a quality
  // report, a fit result, or a failure of either. Both point at the same model today
  // (see fitContext.ts); adaptive thinking + medium effort in both cases.
  const needsAnalysis = datasetNeedsAnalysis(ctx.dataset) || hasFitResults(ctx.fit);
  const model = needsAnalysis ? ARCHITECT_ANALYST_MODEL : ARCHITECT_CONFIG_MODEL;

  return {
    model,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    tools: [PROPOSE_PREPARE_RECIPE_TOOL, PROPOSE_CONFIG_TOOL, RECORD_CONTEXT_TOOL],
    // Cache breakpoints on the two stable blocks: the fixed instructions (byte-identical
    // for everyone, forever) and the per-project uploaded-data context (stable across a
    // session until new data is uploaded). The dataset and fit-results blocks are placed
    // AFTER them, uncached — both change whenever a prepare/fit finishes, and keeping
    // them past the last breakpoint means a fresh result never invalidates the cached
    // prefix.
    // Cache breakpoints on the three stable, byte-identical-across-requests blocks: the
    // fixed instructions, the static NL calendar reference, and the per-project uploaded-data
    // context (stable across a session once profiles/mappings are cached). The volatile
    // blocks — business context, deep inspection, dataset and fit results — sit AFTER the
    // last breakpoint so a fresh result never invalidates the cached prefix. (4 breakpoints
    // total incl. the newest user turn set in the chat route — the per-request maximum.)
    system: [
      { type: "text", text: SYSTEM_INSTRUCTIONS, cache_control: { type: "ephemeral" } },
      { type: "text", text: formatCalendarReference(), cache_control: { type: "ephemeral" } },
      { type: "text", text: dataContext, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Zakelijke context voor dit project:\n\n${formatBusinessContextBlock(ctx.businessContext)}` },
      { type: "text", text: `Diepe data-inspectie voor dit project:\n\n${formatInspectionBlock(ctx.inspection)}` },
      { type: "text", text: `Data-voorbereiding voor dit project:\n\n${datasetContext}` },
      { type: "text", text: `Laatste fit / resultaten voor dit project:\n\n${resultsContext}` },
    ],
    messages: history,
  };
}
