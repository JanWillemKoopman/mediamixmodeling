// Per kwaliteitsissue-code: wat betekent dit voor het model, en wat is de logische
// vervolgactie? Het kwaliteitsrapport wordt hiermee actionable in plaats van een lijst
// zinnen: elke fout/waarschuwing krijgt een "waarom boeit dit"-uitleg en waar mogelijk
// een concrete actiehint (vaak: een gerichte chatvraag aan de AI). Onbekende codes —
// oudere datasets, toekomstige checks — vallen in de UI gewoon terug op de kale melding,
// dus deze registry hoeft nooit compleet te zijn om te werken.
export interface QualityIssueInfo {
  // Eén à twee zinnen: waarom is dit relevant voor een betrouwbaar MMM?
  explain: string;
  // Concreet vervolg — als chatPrompt gezet is, wordt dit de knoptekst.
  action?: string;
  // Kant-en-klare prompt voor de wizard-chat om dit specifieke issue op te lossen.
  chatPrompt?: string;
}

export const QUALITY_ISSUE_REGISTRY: Record<string, QualityIssueInfo> = {
  currency_parsed: {
    explain:
      "Het bestand bevat bedragen met valutasymbolen of komma-notatie. Die zijn automatisch omgerekend naar getallen — verkeerd geïnterpreteerd zou elke waarde ×1000 of ÷1000 verschillen.",
    action: "Controleer een paar bedragen in het voorbeeld (2c) tegen het originele bestand.",
  },
  negative_spend: {
    explain:
      "Negatieve uitgaven (refunds, correcties) bestaan boekhoudkundig, maar het model interpreteert spend als mediadruk — negatieve druk bestaat niet en verstoort de adstock-schatting.",
    action: "Laat de AI een opschoonstap voorstellen",
    chatPrompt:
      "Mijn spend-data bevat negatieve weken (refunds/correcties). Stel een passende opschoonstap voor: op nul zetten, verrekenen met omliggende weken, of iets beters gegeven deze data.",
  },
  all_zero_channel: {
    explain:
      "Een kanaal dat de hele periode € 0 uitgaf levert geen informatie, maar kost wél modelparameters en vertroebelt de budgetoptimalisatie.",
    action: "Verwijder de kolom uit het recept, of controleer of de samenvoeging dit kanaal per ongeluk leegmaakte.",
  },
  zero_variance_column: {
    explain:
      "Een constante kolom kan per definitie niets verklaren van de wekelijkse variatie in de KPI — hij kost alleen een parameter.",
    action: "Zet de rol op “(niet gebruiken)” of controleer of de kolom correct is samengevoegd.",
  },
  duplicate_dates_aggregated: {
    explain:
      "Meerdere verschillende rijen op dezelfde datum worden opgeteld. Bevat het bestand een totaalrij naast detailrijen, dan telt alles dubbel — een klassieke stille fout.",
    action: "Laat de AI het bestand controleren",
    chatPrompt:
      "Eén van mijn bronbestanden heeft meerdere verschillende rijen per datum. Kijk naar de voorbeeldrijen en stel vast of hier dubbeltelling dreigt (bv. totaalrij + detailrijen); stel zo nodig een filter- of dedupe-opschoonstap voor.",
  },
  too_many_parameters: {
    explain:
      "Elk kanaal kost meerdere parameters (effect, na-ijl, verzadiging). Met te weinig weken per kanaal kan het model de kanalen niet uit elkaar houden en worden alle schattingen onbetrouwbaar breed.",
    action: "Voeg meer weken data toe, of laat de AI voorstellen welke kanalen samengevoegd kunnen worden.",
    chatPrompt:
      "Ik heb te veel kanalen voor het aantal weken data. Stel voor welke kanalen ik het best kan samenvoegen (bv. op basis van kanaaltype of correlatie) om het model schatbaar te maken.",
  },
  partial_edge_week: {
    explain:
      "De eerste of laatste week van een bestand dekt maar een deel van de dagen; opgeteld lijkt die week onterecht een dip — precies op het recentste datapunt.",
    action: "Overweeg deze randweek weg te laten (filter-opschoonstap) of exporteer het bestand opnieuw over hele weken.",
  },
  multicollinearity: {
    explain:
      "Deze kanalen bewegen als groep te veel samen (ook al lijkt geen enkel paar los verdacht). Het model kan hun afzonderlijke bijdrage dan niet vaststellen — juist de ROI per kanaal wordt onbetrouwbaar.",
    action: "Laat de AI de kanalen samenvoegen of adviseren welke je kunt laten vallen",
    chatPrompt:
      "Het kwaliteitsrapport meldt sterke multicollineariteit (hoge VIF) tussen enkele kanalen. Adviseer welke ik het best kan samenvoegen of laten vallen, of stel een combine-opschoonstap voor die ze bundelt tot een totaal.",
  },
  coarse_cadence: {
    explain:
      "Dit bestand heeft een grovere cadans dan wekelijks (bijvoorbeeld maandelijks). Op een weekrooster worden de meeste weken dan leeg of op 0 gezet, wat het wekelijkse model vertekent.",
    action: "Lever KPI en spend op dezelfde cadans aan, of laat de AI adviseren of maandmodellering hier beter past.",
  },
  predictor_outlier_weeks: {
    explain:
      "Een spend- of control-kolom heeft een week die sterk afwijkt van zijn buren. Vaak is dat een echte gebeurtenis (campagnepiek), soms een invoerfout (dubbele factuur, eenheden verwisseld).",
    action: "Controleer de week; is het een echte gebeurtenis, overweeg dan een event-dummy, anders corrigeer de bron.",
  },
  near_identical_channels: {
    explain:
      "Twee vrijwel identieke kanalen kan het model niet los van elkaar schatten: de bijdrage wordt willekeurig over beide verdeeld en beide krijgen brede marges.",
    action: "Gebruik er één, of laat de AI ze samenvoegen tot één kanaal.",
    chatPrompt:
      "Twee van mijn spend-kanalen zijn vrijwel identiek volgens het kwaliteitsrapport. Stel een combine-opschoonstap voor die ze samenvoegt tot één kanaal, of adviseer welke ik moet laten vallen.",
  },
  kpi_outlier_weeks: {
    explain:
      "Een extreme uitschieter in de KPI trekt de schattingen van álle kanalen scheef als het model hem aan media probeert toe te schrijven.",
    action: "Voeg een event-dummy toe voor precies die week (kan in het handmatig-paneel of via de AI).",
    chatPrompt:
      "Het kwaliteitsrapport meldt uitschieter-weken in mijn KPI. Stel event-dummy's voor voor precies die weken, met een logische naam per gebeurtenis.",
  },
  year_end_anomaly: {
    explain:
      "Rond de jaarwisseling wijkt gedrag structureel af (feestdagen, gesloten winkels). Zonder correctie schrijft het model die pieken/dalen onterecht aan media toe.",
    action: "Voeg een event-dummy toe voor de jaarwisselingsweken.",
  },
  kpi_gaps: {
    explain:
      "Weken zonder KPI-waarde kan het model niet gebruiken — gaten in de doelvariabele worden nooit stilletjes opgevuld.",
    action: "Vul de ontbrekende weken in de bron aan, of kies een venster zonder deze gaten.",
  },
  control_gaps: {
    explain:
      "Een control-kolom met gaten laat het model niet fitten. Gaten in controls mogen wél gevuld worden — als jij de strategie kiest.",
    action: "Kies een vulstrategie in de kolom “Gaten vullen” van het handmatig-paneel.",
  },
  no_overlap: {
    explain:
      "De essentiële bestanden delen geen enkele week — er is letterlijk geen periode waarin KPI én spend allebei bestaan.",
    action: "Controleer de datumkolommen (formaat!) en de periodes van de bestanden.",
  },
  duplicate_rows: {
    explain: "Volledig identieke rijen worden opgeteld bij het samenvoegen — meestal een dubbele export.",
    action: "Klopt dit niet, laat de AI dan een dedupe-opschoonstap toevoegen.",
  },
  unparseable_dates: {
    explain: "Rijen met een onleesbare datum zijn overgeslagen — bij veel rijen wijst dit op een afwijkend datumformaat.",
    action: "Laat de AI het datumformaat forceren",
    chatPrompt:
      "Een deel van mijn rijen heeft onleesbare datums. Kijk naar de voorbeeldrijen en stel een parse_date-opschoonstap met het juiste formaat voor.",
  },
  missing_column: {
    explain: "Het recept verwijst naar een kolom die niet in het bestand staat — vaak een typefout of een gewijzigde export.",
    action: "Corrigeer de kolomnaam in het handmatig-paneel.",
  },
  window_boundary: {
    explain:
      "De analyseperiode loopt precies zolang álle essentiële bronnen tegelijk data hebben. Deze bron bepaalt een van de randen — daarbuiten is er (nog) geen overlap.",
    action: "Klopt de periode niet? Controleer of een bron een afwijkend datumbereik heeft, of upload een langere export.",
  },
  source_window_trimmed: {
    explain:
      "Deze bron heeft weken buiten de gezamenlijke periode; die data bestaat wél, maar geen andere bron dekt die weken, dus ze vallen weg bij het uitlijnen.",
    action: "Wil je die weken behouden, zorg dan dat de andere bronnen dezelfde periode dekken.",
  },
  spend_imputed_zero: {
    explain:
      "Ontbrekende spend-weken binnen het venster zijn op € 0 gezet: geen registratie betekent geen uitgave. Klopt dat niet (data ontbreekt echt), corrigeer dan de bron.",
  },
};

export function issueInfo(code: string): QualityIssueInfo | null {
  return QUALITY_ISSUE_REGISTRY[code] ?? null;
}
