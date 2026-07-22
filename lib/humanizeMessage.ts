// Eén centrale vertaalslag van technische foutmeldingen (Python/mmm-core, de worker,
// Supabase) naar duidelijk Nederlands voor de doelgroep: een data-analist, geen
// engineer. Grondregels:
//   1. De hoofdmelding zegt in gewone taal WAT er mis is en WAT je eraan doet.
//   2. De ruwe technische melding gaat niet verloren: hij komt terug als `technical`
//      en wordt in de UI klein/inklapbaar getoond — nuttig voor de chat-AI en debugging.
//   3. Onbekende fouten krijgen een nette generieke melding mét de ruwe tekst als detail,
//      nooit een kale Engelse stacktrace als hoofdmelding.
// De patronen spiegelen letterlijk de raise-teksten in packages/mmm-core en de worker —
// verandert daar een tekst, dan valt de vertaling terug op de generieke melding (geen
// crash, alleen minder mooi).

export interface HumanMessage {
  text: string;
  // De onvertaalde bronmelding, alleen gezet als die extra informatie bevat.
  technical: string | null;
}

interface ErrorPattern {
  match: RegExp;
  text: string | ((m: RegExpMatchArray) => string);
}

// --- Samenvoeg-/berekeningsfouten (dataset.error, job.error, API-antwoorden) ---

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    match: /could not auto-detect a date column/i,
    text:
      "In (minstens) één bestand is geen datumkolom gevonden. Elk bestand heeft een kolom met weekdatums nodig (bijvoorbeeld 2024-01-06). " +
      "Open “Handmatig voorbereiden” en vul daar per bestand de datumkolom in, of vraag de AI in de chat welke kolom de datum bevat.",
  },
  {
    match: /no overlapping region data|essential sources do not overlap in time/i,
    text:
      "De bestanden hebben geen overlappende periode: de weken uit het ene bestand sluiten nergens aan op die van het andere. " +
      "Controleer per bestand het datumbereik (zie de bestandskaarten bij stap 1) en gebruik alleen bronnen die dezelfde periode beslaan.",
  },
  {
    match: /no essential source produced any data/i,
    text:
      "Geen van de bestanden leverde bruikbare data op — er valt geen gezamenlijke periode te bepalen. " +
      "Controleer of de datumkolom klopt en of de bestanden daadwerkelijk rijen met data bevatten.",
  },
  {
    match: /KPI column contains missing\/non-finite values/i,
    text:
      "De KPI-kolom bevat lege of ongeldige waarden. Het model kan daar niet mee rekenen — vul de gaten of verwijder die weken voordat je samenvoegt (de AI kan hier een opschoonstap voor voorstellen).",
  },
  {
    match: /a channel spend column contains missing\/non-finite values/i,
    text:
      "Een spend-kolom bevat lege of ongeldige waarden. Zet ontbrekende uitgaven op 0 of laat de AI een opschoonstap voorstellen.",
  },
  {
    match: /need at least two weeks of data/i,
    text: "Er zijn minstens twee weken aan data nodig om iets te kunnen samenvoegen of berekenen.",
  },
  {
    match: /(model )?needs? at least one channel/i,
    text: "Er is nog geen enkel spend-kanaal gekozen. Wijs minstens één kolom de rol “Spend” toe.",
  },
  {
    match: /column '([^']+)' already exists|column "([^"]+)" already exists/i,
    text: (m) =>
      `Twee kolommen krijgen na het samenvoegen dezelfde naam (“${m[1] ?? m[2]}”). Geef er één een andere “Naam in dataset” in de handmatige tabel.`,
  },
  {
    match: /declared column '([^']+)' is not present in the source/i,
    text: (m) =>
      `De kolom “${m[1]}” staat in het voorstel, maar bestaat niet in het bestand. Controleer de kolomnaam (hoofdletters en spaties tellen mee).`,
  },
  {
    match: /job config: missing '([^']+)'/i,
    text: (m) => `De configuratie mist het verplichte veld “${m[1]}”. Vul het formulier verder in of laat de AI een compleet voorstel doen.`,
  },
  {
    match: /unknown fill strategy|unknown feature op|unknown transform op|job config: unknown/i,
    text: "De configuratie bevat een instelling die de rekenkern niet kent. Neem het AI-voorstel opnieuw over, of controleer de JSON op typefouten.",
  },
  {
    match: /calibration (roas|sd) must be/i,
    text: "De kalibratiewaarden kloppen niet: ROAS moet 0 of hoger zijn en de onzekerheid (sd) groter dan 0.",
  },
  {
    match: /ANTHROPIC_API_KEY/i,
    text: "De AI is nog niet geconfigureerd op de server (API-sleutel ontbreekt). Vraag de beheerder dit in te stellen; handmatig voorbereiden werkt wel gewoon.",
  },
  {
    match: /failed to fetch|networkerror|fetch failed|load failed/i,
    text: "Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw.",
  },
];

// Strip technische voorvoegsels die voor de lezer niets toevoegen.
function stripPrefixes(raw: string): string {
  return raw
    .replace(/^\s*(ValueError|RuntimeError|TypeError|KeyError|Exception)\s*:\s*/i, "")
    .replace(/^\s*data quality errors:\s*/i, "")
    .trim();
}

// Vertaal een ruwe fout naar { begrijpelijke tekst, technisch detail }. `fallback` is de
// contextuele noodmelding ("Samenvoegen is mislukt.") als geen enkel patroon past.
export function humanizeError(raw: string | null | undefined, fallback: string): HumanMessage {
  if (!raw || !raw.trim()) return { text: fallback, technical: null };
  const stripped = stripPrefixes(raw);

  // "data quality errors: a; b; c" — vertaal elk deel afzonderlijk.
  if (/^\s*data quality errors:/i.test(raw)) {
    const parts = stripped.split(/;\s*/).map((p) => humanizePart(p));
    return {
      text: `De samenvoeging is gestopt door problemen in de data: ${parts.join(" ")}`,
      technical: raw,
    };
  }

  for (const p of ERROR_PATTERNS) {
    const m = stripped.match(p.match);
    if (m) return { text: typeof p.text === "function" ? p.text(m) : p.text, technical: raw };
  }
  // Nederlandse meldingen uit onze eigen API-routes zijn al goed — ongemoeid doorlaten.
  if (looksDutch(stripped)) return { text: stripped, technical: null };
  return { text: fallback, technical: raw };
}

function humanizePart(part: string): string {
  for (const p of ERROR_PATTERNS) {
    const m = part.match(p.match);
    if (m) return typeof p.text === "function" ? p.text(m) : p.text;
  }
  const q = humanizeQualityMessage(part);
  return q === part && !looksDutch(part) ? part : q;
}

// Ruwe heuristiek: bevat de tekst typisch-Nederlandse woorden? Dan is hij vrijwel zeker
// al door onszelf geschreven en moet hij niet door een generieke fallback worden vervangen.
function looksDutch(s: string): boolean {
  return /\b(de|het|een|niet|geen|mislukt|verplicht|toegang|bestand|kolom|opnieuw|wacht|eerst|gelukt|fout|taken)\b/i.test(s);
}

// --- Kwaliteitsrapport-meldingen (QualityReportView, stap 2) ---
// De rekenkern schrijft deze in het Engels met dynamische delen (kolomnamen, weken);
// hier per sjabloon vertaald mét behoud van die delen.

const QUALITY_PATTERNS: ErrorPattern[] = [
  {
    match: /^auto-detected date column '([^']+)'/i,
    text: (m) => `Datumkolom “${m[1]}” automatisch herkend.`,
  },
  {
    match: /^(\d+) duplicate raw row\(s\) found and kept/i,
    text: (m) => `${m[1]} dubbele rij(en) gevonden en behouden — ze worden bij het samenvoegen opgeteld.`,
  },
  {
    match: /^(\d+) row\(s\) with unparseable dates were dropped/i,
    text: (m) => `${m[1]} rij(en) met een onleesbare datum zijn overgeslagen.`,
  },
  {
    match: /^declared column '([^']+)' is not present in the source/i,
    text: (m) => `Kolom “${m[1]}” staat in het voorstel maar bestaat niet in het bestand.`,
  },
  {
    match: /^(\d+) non-numeric\/missing value\(s\) in '([^']+)' treated as missing/i,
    text: (m) => `${m[1]} niet-numerieke of lege waarde(n) in “${m[2]}” behandeld als ontbrekend.`,
  },
  {
    match: /^column\(s\) (\[[^\]]*\]) exist in multiple sources; prefixed with source name in '([^']+)'/i,
    text: (m) => `Kolommen ${m[1]} komen in meerdere bestanden voor; in “${m[2]}” is de bestandsnaam als voorvoegsel toegevoegd.`,
  },
  {
    match: /^channels '([^']+)' and '([^']+)' are near-identical \(r=([\d.,-]+)\)/i,
    text: (m) =>
      `Kanalen “${m[1]}” en “${m[2]}” zijn vrijwel identiek (correlatie ${m[3]}). Het model kan hun effect dan niet los van elkaar schatten — overweeg er één te gebruiken of ze samen te voegen.`,
  },
  {
    match: /^'([^']+)' has extreme value\(s\) in turn-of-year week\(s\) (.+?); consider an event dummy/i,
    text: (m) =>
      `“${m[1]}” heeft extreme waarde(n) rond de jaarwisseling (${m[2]}). Overweeg een event-dummy of sluit deze weken uit.`,
  },
  {
    match: /^'([^']+)' has locally anomalous value\(s\) in week\(s\) (.+?) \(values (.+?)\); consider an event dummy/i,
    text: (m) =>
      `“${m[1]}” heeft opvallende uitschieter(s) in week ${m[2]} (waarde(n) ${m[3]}). Overweeg een event-dummy voor precies die week/weken.`,
  },
  {
    match: /^event dummy '([^']+)' collides with an existing column name/i,
    text: (m) => `Event-dummy “${m[1]}” botst met een bestaande kolomnaam — kies een andere naam.`,
  },
  {
    match: /^event dummy '([^']+)' has no active week inside the analysis window \(([^)]+)\)/i,
    text: (m) =>
      `Event-dummy “${m[1]}” valt buiten de analyseperiode (${m[2]}) en heeft daardoor geen enkel effect.`,
  },
  {
    match: /^derived feature '([^']+)' collides with an existing column name/i,
    text: (m) => `Afgeleide variabele “${m[1]}” botst met een bestaande kolomnaam — kies een andere naam.`,
  },
  {
    match: /^derived feature '([^']+)' could not be computed: (.+)$/i,
    text: (m) => `Afgeleide variabele “${m[1]}” kon niet worden berekend (${m[2]}).`,
  },
  {
    match: /^derived feature '([^']+)' added as a control column/i,
    text: (m) => `Afgeleide variabele “${m[1]}” toegevoegd als control-kolom.`,
  },
  {
    match: /^KPI column '([^']+)' has (\d+) missing week\(s\) inside the window/i,
    text: (m) => `KPI-kolom “${m[1]}” mist ${m[2]} week/weken binnen de periode — het model kan daar niet omheen; vul of verwijder die weken.`,
  },
  {
    match: /^control column '([^']+)' had (\d+) missing week\(s\), filled with strategy '([^']+)'/i,
    text: (m) => `Control-kolom “${m[1]}” had ${m[2]} ontbrekende week/weken; gevuld met strategie “${m[3]}”.`,
  },
  {
    match: /^control column '([^']+)' has (\d+) missing week\(s\) inside the window/i,
    text: (m) =>
      `Control-kolom “${m[1]}” heeft ${m[2]} ontbrekende week/weken. Kies een vulstrategie (“Gaten vullen”) of schoon de kolom op vóór het modelleren.`,
  },
  {
    match: /^imputed (\d+) missing spend week\(s\) with 0/i,
    text: (m) => `${m[1]} ontbrekende spend-week/weken op 0 gezet (geen uitgave geregistreerd = € 0).`,
  },
  {
    match: /^column '([^']+)' contains formatted numbers \(e\.g\. '([^']+)'\); parsed as (.+?) — check/i,
    text: (m) =>
      `Kolom “${m[1]}” bevat opgemaakte getallen (bv. ${m[2]}); geïnterpreteerd als ${m[3]}-notatie. Controleer een paar waarden in het voorbeeld om de omrekening te bevestigen.`,
  },
  {
    match: /^spend column '([^']+)' has (\d+) negative week\(s\) \(min (-?[\d.]+)/i,
    text: (m) =>
      `Spend-kolom “${m[1]}” heeft ${m[2]} week/weken met negatieve uitgaven (minimum ${m[3]}) — waarschijnlijk refunds of correcties. Zet ze op 0 of verreken ze vóór het modelleren.`,
  },
  {
    match: /^spend column '([^']+)' is zero for the entire analysis window/i,
    text: (m) =>
      `Spend-kolom “${m[1]}” is de hele periode 0 — het model kan niets over dit kanaal leren. Verwijder het kanaal of controleer de samenvoeging.`,
  },
  {
    match: /^column '([^']+)' is constant over the whole window \(value ([^)]+)\)/i,
    text: (m) =>
      `Kolom “${m[1]}” heeft de hele periode dezelfde waarde (${m[2]}) en voegt daardoor geen informatie toe aan het model.`,
  },
  {
    match: /^(\d+) date\(s\) have multiple different rows \(e\.g\. ([\d-]+) with (\d+) rows\)/i,
    text: (m) =>
      `${m[1]} datum(s) hebben meerdere verschillende rijen (bv. ${m[2]} met ${m[3]} rijen); de waarden worden opgeteld. Controleer op dubbeltelling — bijvoorbeeld een totaalrij naast detailrijen.`,
  },
  {
    match: /^(\d+) channel\(s\) on (\d+) week\(s\) of data \(([\d.]+) weeks per channel.*far too little data/i,
    text: (m) =>
      `${m[1]} kanalen op maar ${m[2]} weken data (${m[3]} weken per kanaal) — veel te weinig om de kanalen uit elkaar te houden. Voeg weken toe of voeg kanalen samen.`,
  },
  {
    match: /^(\d+) channel\(s\) on (\d+) week\(s\) of data \(([\d.]+) weeks per channel\) — expect wide/i,
    text: (m) =>
      `${m[1]} kanalen op ${m[2]} weken data (${m[3]} weken per kanaal) — krap; verwacht brede onzekerheidsmarges per kanaal.`,
  },
  {
    match: /^the (first|last) week \(([\d-]+)\) of source '([^']+)' covers only (\d+) row\(s\) where interior weeks have ~(\d+)/i,
    text: (m) =>
      `De ${m[1] === "first" ? "eerste" : "laatste"} week (${m[2]}) van bestand “${m[3]}” bevat maar ${m[4]} van de gebruikelijke ~${m[5]} rijen — een deelweek. De opgetelde waarde valt daardoor te laag uit; overweeg deze week weg te laten.`,
  },
  {
    match: /^source\(s\) (\[[^\]]*\]) start on ([\d-]+), which sets the start of the analysis window/i,
    text: (m) =>
      `Bron(nen) ${m[1]} beginnen op ${m[2]} en bepalen daarmee de startdatum van de analyseperiode — eerdere weken van andere bronnen vallen weg omdat er dan nog geen overlap is.`,
  },
  {
    match: /^source\(s\) (\[[^\]]*\]) end on ([\d-]+), which sets the end of the analysis window/i,
    text: (m) =>
      `Bron(nen) ${m[1]} eindigen op ${m[2]} en bepalen daarmee de einddatum van de analyseperiode — latere weken van andere bronnen vallen weg.`,
  },
  {
    match: /^source '([^']+)' loses (\d+) week\(s\) outside the shared window \((\d+) before ([\d-]+), (\d+) after ([\d-]+)\)/i,
    text: (m) =>
      `Bestand “${m[1]}” verliest ${m[2]} week/weken buiten de gezamenlijke periode (${m[3]} vóór ${m[4]}, ${m[5]} ná ${m[6]}); die data bestaat wel, maar geen andere bron dekt die weken.`,
  },
  {
    match: /^predictor\(s\) (\[[^\]]*\]) are strongly collinear with the other predictors \(VIF up to ([\d.]+)\)/i,
    text: (m) =>
      `Voorspeller(s) ${m[1]} hangen sterk samen met de overige kolommen (VIF tot ${m[2]}); het model kan hun afzonderlijke effect niet vaststellen, dus ROI/bijdrage per kanaal wordt onbetrouwbaar. Overweeg er één samen te voegen, te laten vallen, of te bundelen tot een totaal.`,
  },
  {
    match: /^source '([^']+)' has a (\S+) cadence \(median (\d+) days between rows\)/i,
    text: (m) =>
      `Bestand “${m[1]}” heeft een ${m[2] === "maandelijks" ? "maandelijkse" : m[2]} cadans (mediaan ${m[3]} dagen tussen rijen); op een weekrooster worden de meeste weken leeg of op 0 gezet, wat het wekelijkse model vertekent. Lever de data op weekniveau aan of modelleer op die resolutie.`,
  },
  {
    match: /^(spend|control) column '([^']+)' has locally unusual value\(s\) in week\(s\) (.+?) \(values (.+?)\); check whether/i,
    text: (m) =>
      `${m[1] === "spend" ? "Spend" : "Control"}-kolom “${m[2]}” heeft opvallende waarde(n) in week ${m[3]} (waarde(n) ${m[4]}). Controleer of dit een echte gebeurtenis is of een invoerfout.`,
  },
  {
    match: /^essential sources do not overlap in time/i,
    text: () => "De bestanden hebben geen overlappende periode — er is geen gezamenlijk analysevenster.",
  },
  {
    match: /^no essential source produced any data/i,
    text: () => "Geen van de bestanden leverde bruikbare data op — controleer datumkolom en inhoud.",
  },
];

// Vertaal één kwaliteitsmelding; onbekende sjablonen blijven ongemoeid (beter een
// Engelse detailmelding dan een verzonnen vertaling).
export function humanizeQualityMessage(message: string): string {
  // Python's repr gebruikt 'enkele quotes'; normaliseer eventuele dubbele.
  const normalized = message.replace(/"([^"]*)"/g, "'$1'");
  for (const p of QUALITY_PATTERNS) {
    const m = normalized.match(p.match);
    if (m) return typeof p.text === "function" ? p.text(m) : p.text;
  }
  return message;
}

// --- Supabase-auth (inloggen / magische link) ---

const AUTH_PATTERNS: ErrorPattern[] = [
  { match: /invalid login credentials/i, text: "E-mailadres of wachtwoord klopt niet. Probeer het opnieuw, of gebruik de magische link hieronder." },
  { match: /email not confirmed/i, text: "Je e-mailadres is nog niet bevestigd — klik eerst op de link in de bevestigingsmail." },
  { match: /user already registered/i, text: "Er bestaat al een account met dit e-mailadres." },
  { match: /(security purposes|rate limit).*/i, text: "Om veiligheidsredenen kan dit pas over een paar seconden opnieuw. Wacht even en probeer het nog eens." },
  { match: /invalid email/i, text: "Dit lijkt geen geldig e-mailadres — controleer de spelling." },
  { match: /failed to fetch|networkerror|fetch failed|load failed/i, text: "Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw." },
];

export function humanizeAuthError(raw: string | null | undefined): string {
  if (!raw) return "Inloggen is niet gelukt. Probeer het opnieuw.";
  for (const p of AUTH_PATTERNS) {
    const m = raw.match(p.match);
    if (m) return typeof p.text === "function" ? p.text(m) : p.text;
  }
  return "Inloggen is niet gelukt. Probeer het opnieuw of gebruik de magische link.";
}
