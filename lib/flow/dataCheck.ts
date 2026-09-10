// Wat de gebruiker over zijn eigen bestand te horen krijgt, vóórdat er iets draait.
//
// Twee dingen, allebei deterministisch en allebei in gewone taal:
//   1. `checkSource` — kan hier überhaupt een model op? Dat oordeel hoorde de gebruiker
//      vroeger pas twee stappen verderop, als het samenvoegen struikelde.
//   2. `analyseProfile` — wat is er aan deze data opvallend, en welke keuze hoort daarbij.
//
// GEEN statistiek. Dit is een leesbaarheidscontrole op het profiel dat bij de upload is
// gemaakt (lib/dataProfile.ts): telt het aantal weken, staat er een datumkolom in, zijn er
// genoeg getalkolommen. De echte beoordeling blijft waar hij hoort — `validate_columns` en
// de kwaliteitscontrole in mmm-core, met de worker als scheidsrechter. Wat hier staat mag
// nooit een reden zijn om die over te slaan; het bespaart de gebruiker alleen het wachten
// op een oordeel dat je aan de voordeur al kunt geven.

import type { ColumnMapping, SourceProfile } from "@/lib/types";

export type SourceVerdict = "usable" | "usable_with_warnings" | "not_usable";

export interface SourceCheck {
  verdict: SourceVerdict;
  headline: string;
  /** Wat er goed is en wat niet — elk punt in één regel. */
  points: { tone: "ok" | "warn" | "blocking"; text: string }[];
}

/** Hoeveel weken beslaat de reeks? Losstaand van dag- of weekregels. */
export function weeksCovered(profile: SourceProfile): number | null {
  const range = profile.date_range;
  if (!range) return null;
  const start = new Date(range[0]).getTime();
  const end = new Date(range[1]).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / (7 * 24 * 3600 * 1000));
}

// Onder deze grens valt er niets zinnigs te schatten: een model dat na-ijl, verzadiging en
// seizoen uit elkaar moet halen heeft simpelweg meer weken nodig dan het parameters heeft.
const MIN_WEEKS = 26;
const COMFORTABLE_WEEKS = 52;

export function checkSource(profile: SourceProfile | null): SourceCheck {
  if (!profile) {
    return {
      verdict: "not_usable",
      headline: "Ik kan dit bestand niet lezen.",
      points: [
        {
          tone: "blocking",
          text: "Het lukte niet om er rijen en kolommen uit te halen. Is het een CSV met een kopregel?",
        },
      ],
    };
  }

  const points: SourceCheck["points"] = [];
  let blocking = 0;
  let warnings = 0;

  const numeric = profile.columns.filter((c) => c.kind === "numeric");

  if (!profile.date_column) {
    points.push({ tone: "blocking", text: "Ik vind geen datumkolom. Zonder datum kan ik geen weken maken." });
    blocking++;
  } else {
    points.push({ tone: "ok", text: `Datumkolom gevonden: ${profile.date_column}.` });
  }

  const weeks = weeksCovered(profile);
  if (weeks == null) {
    if (profile.date_column) {
      points.push({ tone: "warn", text: "Ik kan de periode niet goed lezen — controleer het datumformaat." });
      warnings++;
    }
  } else if (weeks < MIN_WEEKS) {
    points.push({
      tone: "blocking",
      text: `Je reeks beslaat ${weeks} weken. Onder de ${MIN_WEEKS} weken valt er niets betrouwbaars te schatten.`,
    });
    blocking++;
  } else if (weeks < COMFORTABLE_WEEKS) {
    points.push({
      tone: "warn",
      text: `Je reeks beslaat ${weeks} weken. Dat kan, maar met minder dan een jaar wordt de uitkomst onzekerder — en dat zeg ik straks ook.`,
    });
    warnings++;
  } else {
    points.push({ tone: "ok", text: `${weeks} weken aan data — ruim genoeg.` });
  }

  if (numeric.length < 2) {
    points.push({
      tone: "blocking",
      text: "Ik zie niet genoeg getalkolommen. Er moet minstens één resultaatkolom zijn en één kolom per kanaal.",
    });
    blocking++;
  } else {
    points.push({ tone: "ok", text: `${numeric.length} getalkolommen om uit te kiezen.` });
  }

  const verdict: SourceVerdict = blocking > 0 ? "not_usable" : warnings > 0 ? "usable_with_warnings" : "usable";
  const headline =
    verdict === "not_usable"
      ? "Hier kan ik nog geen model op bouwen."
      : verdict === "usable_with_warnings"
        ? "Dit kan, met een kanttekening."
        : "Dit ziet er goed uit.";

  return { verdict, headline, points };
}

// --- bevindingen voor stap 4 -----------------------------------------------------------

export interface FindingChoice {
  id: string;
  label: string;
  /** Wat deze keuze doet, in één regel — zodat een keuze nooit een gok is. */
  effect: string;
}

const KEEP: FindingChoice = {
  id: "keep",
  label: "Laat staan",
  effect: "Ik verander niets aan deze cijfers.",
};

export interface DataFinding {
  id: string;
  kind: "gap" | "outlier" | "duplicate";
  headline: string;
  detail: string;
  choices: FindingChoice[];
  defaultChoice: string;
}

export interface ProfileAnalysis {
  /** Punten waar de gebruiker iets over moet beslissen. */
  findings: DataFinding[];
  /** Punten die hij moet wéten, maar waar niets te kiezen valt. */
  notes: string[];
}

/**
 * De opvallende dingen in het profiel, vertaald naar vragen met keuzes.
 *
 * Er wordt hier alleen iets voorgelegd wat de rekenkern ook echt kan uitvoeren. Dat is geen
 * detail: een keuzemenu dat iets belooft wat de motor niet kent, is precies de soort belofte
 * die de oude wizard deed. Concreet volgt dit `mmm_core.ingestion`:
 *   * ontbrekende kanaalweken wórden binnen het venster al als nul gelezen — daar valt niets
 *     te kiezen, dus dat is een mededeling;
 *   * `fill` bestaat alleen voor controls (spec.py weigert het op een andere rol);
 *   * gaten in de KPI worden gemeld en nooit stilzwijgend opgevuld — ook een mededeling.
 *
 * Bewust een korte lijst: elk punt kost aandacht, en een lijst van dertig meldingen leest
 * niemand.
 */
export function analyseProfile(
  profile: SourceProfile | null,
  mapping: ColumnMapping | null,
): ProfileAnalysis {
  if (!profile) return { findings: [], notes: [] };
  const roleOf = new Map((mapping?.columns ?? []).map((c) => [c.name, c.role]));
  const modelled = (name: string) => {
    const role = roleOf.get(name);
    return role === "kpi" || role === "spend" || role === "control";
  };

  const findings: DataFinding[] = [];
  const notes: string[] = [];

  for (const col of profile.columns) {
    if (!modelled(col.name) || col.longest_missing_run < 2) continue;
    const role = roleOf.get(col.name);

    if (role === "spend") {
      notes.push(
        `"${col.name}" heeft ${col.longest_missing_run} weken achter elkaar geen waarde. Die lees ik als nul — geen uitgave.`,
      );
      continue;
    }
    if (role === "kpi") {
      notes.push(
        `"${col.name}" mist ${col.longest_missing_run} weken achter elkaar. Je resultaat verzin ik niet: die weken blijven leeg en je ziet ze terug in het kwaliteitsrapport.`,
      );
      continue;
    }

    // Alleen bij een control valt er iets te kiezen — daar kent de rekenkern een fill voor.
    findings.push({
      id: `gap:${col.name}`,
      kind: "gap",
      headline: `"${col.name}" heeft ${col.longest_missing_run} weken achter elkaar geen waarde.`,
      detail: "Wat moet ik met die weken doen?",
      choices: [
        { id: "ffill", label: "Neem de vorige waarde over", effect: "Ik vul de gaten met de laatst bekende waarde." },
        { id: "zero", label: "Lees ze als nul", effect: "Ik zet die weken op nul." },
        { id: "interpolate", label: "Loop er vloeiend doorheen", effect: "Ik trek een rechte lijn tussen de bekende waarden." },
        KEEP,
      ],
      defaultChoice: "ffill",
    });
  }

  // Uitschieters: alleen op de KPI. Een piek in een kanaal is meestal gewoon een campagne;
  // een piek in het resultaat is iets wat het model anders aan je marketing toeschrijft.
  for (const col of profile.columns) {
    if (roleOf.get(col.name) !== "kpi") continue;
    for (const outlier of col.outliers.slice(0, 3)) {
      findings.push({
        id: `outlier:${col.name}:${outlier.label}`,
        kind: "outlier",
        headline: `${outlier.label} springt eruit: ${outlier.value.toLocaleString("nl-NL")}.`,
        detail:
          "Speelde daar iets bijzonders — een actie, een storing, een feestdag? Dan zet ik die week apart. " +
          "Doe ik dat niet, dan schrijft het model die piek toe aan je marketing.",
        choices: [
          {
            id: "event",
            label: "Er speelde iets bijzonders",
            effect: "Ik zet die week apart, zodat hij je kanaalcijfers niet vertekent.",
          },
          KEEP,
        ],
        defaultChoice: "keep",
      });
    }
  }

  // Kanalen die te veel op elkaar lijken: het model kan ze niet los schatten, en dat wordt
  // later een onscheidbaar paar in het oordeel. Beter hier één keuze dan daar een verrassing.
  for (const pair of profile.high_correlations) {
    if (Math.abs(pair.r) < 0.9) continue;
    if (!modelled(pair.a) || !modelled(pair.b)) continue;

    // Is er één van de twee een hulpkolom en de ander een kanaal, dan is de hulpkolom de
    // kandidaat om te laten vallen — een kanaal weggooien kost je een kanaal. Die voorkeur
    // staat in de ORDE van de keuzes, niet in een stille standaard: de gebruiker beslist.
    const aIsChannel = roleOf.get(pair.a) === "spend";
    const bIsChannel = roleOf.get(pair.b) === "spend";
    const first = aIsChannel && !bIsChannel ? pair.b : bIsChannel && !aIsChannel ? pair.a : pair.b;
    const second = first === pair.b ? pair.a : pair.b;
    const dropId = (name: string) => (name === pair.a ? "drop_a" : "drop_b");

    findings.push({
      id: `duplicate:${pair.a}:${pair.b}`,
      kind: "duplicate",
      headline: `"${pair.a}" en "${pair.b}" bewegen bijna identiek mee.`,
      detail:
        "Kolommen die zo op elkaar lijken zijn niet los te beoordelen: het model kan wel zeggen wat ze samen " +
        "doen, niet wat elk apart doet." +
        (aIsChannel !== bIsChannel
          ? ` "${first}" is geen kanaal maar een hulpkolom, dus die kun je het makkelijkst missen.`
          : ""),
      choices: [
        { id: dropId(first), label: `Laat "${first}" weg`, effect: `Alleen "${second}" gaat mee in het model.` },
        { id: dropId(second), label: `Laat "${second}" weg`, effect: `Alleen "${first}" gaat mee in het model.` },
        { id: "keep", label: "Houd ze allebei", effect: "Je krijgt dan hun gezamenlijke effect, niet elk apart." },
      ],
      defaultChoice: "keep",
    });
  }

  return { findings, notes };
}
