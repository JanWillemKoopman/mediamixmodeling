# Herziening van de chat-pipeline

**Status:** voorstel — wacht op akkoord
**Scope:** het traject dat de gebruiker in `app/projects/[id]` doorloopt, van CSV tot begrepen
uitkomst. De statistische kern (`packages/mmm-core/`), de worker (`worker/`) en het
klantdashboard (`app/dashboard/[projectId]`) blijven inhoudelijk ongemoeid — die zijn net
herzien en doen hun werk.
**Aanleiding:** de flow is voor een niet-technische gebruiker niet te volgen. Dit document
beschrijft eerst wat er nu staat en waarom het niet werkt, dan hoe het opnieuw wordt
opgebouwd.

---

## 0. Uitvoeringsstatus

| Fase | Status | Wat er staat |
|---|---|---|
| 0 — Fundament | ✅ | `0024_flow_ledger.sql` (toegepast), `lib/flow/steps.ts` + `state.ts` + `ledger.ts`, de invarianten over 1584 toestanden, de route-bestaan-test |
| 1 — Skelet | ✅ | `/projects/[id]/flow`: stappenbalk, permanent transcript, kaart-raamwerk, `POST /api/flow` |
| 2 — Data-stappen | ✅ | Stap 1 t/m 4 werkend: doel, aanleveren (met vooraf-oordeel), kolommen (klikbaar), klaarmaken (bevindingen als keuzes) + de doorloop-test op de demo-CSV |
| 3 — Model-stappen | — | |
| 4 — Uitkomst | — | |
| 5 — AI-laag | — | |
| 6 — Afronden | — | |

Onderweg gevonden en meteen gerepareerd: `GET /api/model-configurations/[id]` werd aangeroepen
maar bestond niet, dus "gebruik de afstemming van run N" heeft nooit gewerkt.

De nieuwe route staat náást de bestaande wizard; die blijft ongewijzigd werken tot fase 3 klaar
is. Handelingen die nog niet gebouwd zijn, zeggen dat met zoveel woorden in plaats van stil te
blijven.

---

## 1. Wat er nu staat

De wizard is één React-component (`components/wizard/ChatWizard.tsx`, 654 regels) met daarnaast:

| Onderdeel | Bestand | Wat het doet |
|---|---|---|
| Toestandsmachine | `lib/wizard/phase.ts` | Leidt 12 fasen deterministisch af uit bronnen, dataset en runs |
| Vaste teksten | `lib/wizard/script.ts` | Eén vooraf geschreven bubbel + dossierlabel per fase |
| Menu-parser | `lib/wizard/questions.ts` | Matcht getypte tekst op genummerde opties |
| Fase-afhandeling | `lib/wizard/turns/*.ts` | Per fase: intro-tekst + verwerking van het getypte antwoord |
| Dossier | `components/wizard/ModelDossier.tsx` | Read-only spiegel rechts + voortgangslijst |
| AI | `lib/anthropic/architect.ts` + `app/api/chat/route.ts` | Eén "architect"-prompt voor alle onderwerpen, met 3 tools |

Het ontwerpprincipe is verdedigbaar en goed uitgevoerd: de fase is **deterministisch**, de
teksten kosten geen tokens, en de AI mag alleen *voorstellen* doen in een gesloten woordenschat.
Dat deel blijft. Het probleem zit in de laag erboven — hoe die machine zich aan de gebruiker
presenteert.

## 2. Bevindingen

### 2.1 Het is geen gesprek — en na een refresh is er niets meer

De chat-bubbel van de huidige fase wordt gerenderd **boven** de conversatie
(`ChatWizard.tsx:548` vóór `ChatWizard.tsx:565`). De "waar ben ik nu"-tekst staat dus bovenaan het
scrollvenster, met de oudere berichten eronder — precies omgekeerd aan wat iedereen van een chat
verwacht.

Erger: de conversatie zelf (`turns`, `ChatWizard.tsx:213`) is **client-state**. Bij elke
`router.refresh()` — en die vuurt bij elke Realtime-update, elke 10 seconden tijdens wachten, en
bij elke navigatie — blijft de state weliswaar staan, maar bij een echte page load is alles weg.
De route die de opgeslagen historie teruggeeft (`GET /api/chat`) wordt **nergens aangeroepen**.

Gevolg voor de gebruiker: hij komt terug op zijn project en ziet één bubbel met de huidige stap,
zonder enig spoor van wat hij eerder heeft besloten of waarom. Er is geen dossier van het traject,
alleen een momentopname.

### 2.2 Alles moet getypt worden, ook keuzes

Bewuste ontwerpkeuze ("alles via chat"), maar voor deze doelgroep de duurste. Elke keuze is een
genummerd menu in platte tekst, geparst met heuristieken (`questions.ts:matchOption`):

- Een getypte `1` betekent in de ene fase "kolommen kloppen", in de volgende "dataset goedkeuren",
  in de volgende "laat de AI het afstemmen". Dezelfde toetsaanslag, drie onomkeerbare gevolgen.
- "ja, maar wat betekent optie 2?" matcht niets en gaat naar de LLM — dat is de bedoeling, maar de
  gebruiker weet dat niet en krijgt soms een deterministisch antwoord, soms een AI-antwoord, zonder
  zichtbaar verschil.
- De commentaarblokken in `questions.ts` documenteren twee eerdere bugs in deze parser (een "ja doe
  dat" dat aan een verouderd menu bleef haken). Dat is geen slechte code — het is een categorie
  probleem die niet bestaat zodra een keuze een keuze-affordance is.
- Een verouderd menu blijft zichtbaar staan: `phaseState` en `pendingProposal` worden gewist bij
  faseovergang (`ChatWizard.tsx`), de eerder getoonde tekst niet.

En de zwaarste handeling in het product — een berekening van 3 à 5 minuten starten — hangt aan één
getypt "ja".

### 2.3 De teksten beloven dingen die er niet zijn

| Belofte | Waar | Werkelijkheid |
|---|---|---|
| "een snelle proefdraai (geen echte berekening, wel gratis)" | `script.ts:72` | Bestaat niet. Geen endpoint, geen menuoptie. Het prior-predictive-oordeel komt pas ná het starten van de run, uit de worker. |
| "de rekeninstellingen … aan te passen onder geavanceerd" | `script.ts:74` | Bestaat niet en moet niet bestaan: sampling-parameters staan vast in `app/api/runs/route.ts` (terecht). |
| "ontbrekende waarden en uitschieters, een consistente tijdgranulariteit … los hieronder per onderwerp" | `script.ts` (prepare_recipe) | De stap stelt één open vraag; "nee" levert een standaardrecept zónder fills, events of features. |
| "gebruik afstemming van run N" | `turns/review.ts:179` | Roept `GET /api/model-configurations/{id}` aan. **Die route bestaat niet** (alleen `route.ts` op collectieniveau). De functie faalt altijd. |

`app/api/prepare-auto/route.ts` is dode code: geen enkele aanroeper.

### 2.4 De AI heeft twee tegenstrijdige opdrachten

De systeemprompt (`lib/anthropic/architect.ts`) draagt de architect op **proactief** te zijn:
"wacht niet tot de gebruiker een specifieke vraag stelt", "vraag proactief naar branche,
seizoensdrukte, campagnes". Tegelijk is de architectuur zo gebouwd dat de AI **alleen** aan bod komt
bij vrij typen. Die twee vechten met elkaar: de gebruiker krijgt initiatief van de assistent op
willekeurige momenten (namelijk precies wanneer hij iets typte wat niet matchte) en nooit op de
momenten waar het hoort.

Daarbovenop is de prompt **achtergelopen op de code**. Hij instrueert nog over:
`storage_path` (bestaat niet meer in recepten — het is `source_file_id`), de knop "Controleer & voeg
samen" (bestaat niet meer), en een reeks configuratievelden die na de intent-refactor zijn
verdwenen: `channel_type`, `adstock: "delayed"`, `l_max`, `expected_half_life`, `calibration`,
`student_t`, "een priors-aanpassing". De prompt zegt óók, elders, dat die velden niet bestaan. Het
model krijgt dus instructies die het niet kan uitvoeren en moet zelf uitvogelen welke helft geldt.
Dat is de directe oorzaak van assistent-antwoorden die naast de flow staan.

### 2.5 De voortgangsweergave klopt niet

`ModelDossier.tsx:86` markeert elke stap vóór de huidige als afgerond. Wie de zakelijke context
overslaat, ziet die stap als "✓ afgerond". Wie via een AI-recept meteen naar samenvoegen springt,
ziet "kolomherkenning" als afgerond terwijl hij die kaart nooit heeft gezien. De voortgangsbalk toont
**waar je bent**, niet **wat je hebt gedaan** — en dat is precies de vraag van een gebruiker die niet
weet waar hij is.

Er is bovendien geen enkele plek waar staat *wat er in een stap besloten is*. De fase is af te
leiden uit de data; de beslissing niet.

### 2.6 Terugkoppeling is niet veilig

`goToPhase` (`WizardChatContext.tsx`) is puur client-side en sessiegebonden. Ga je terug naar
"inspect" nadat er al een dataset en een run zijn, dan schrijft optie 1 gewoon naar dezelfde
`source_files`-rij. De bestaande dataset en run worden daarmee stilzwijgend inconsistent met de
kolomrollen waarop ze gebaseerd zijn. Niemand waarschuwt, niets wordt gemarkeerd als verouderd.

### 2.7 De interpretatie — het hele doel — is optioneel en verstopt

Na een geslaagde berekening toont de review-fase: het oordeel, een lijst eerdere runs, en de
`SummaryView` met tabellen en grafieken (R², MAPE, dekking, ESS, intervallen). De **uitleg in
mensentaal** zit achter twee menuopties die de gebruiker zelf moet typen: "analyse genereren" en
"samenvatting schrijven".

Voor iemand zonder statistische achtergrond is dit de verkeerde volgorde. Hij krijgt eerst de
cijfers, dan pas — als hij ernaar vraagt — wat ze betekenen. En het oordeel
("Berekend, maar niet betrouwbaar genoeg") vertelt hem niet wat hij nu moet doen.

### 2.8 Er ontbreken stappen aan het begin

- **Geen doelbepaling.** Nergens wordt gevraagd waar de gebruiker antwoord op wil. Dat bepaalt
  nochtans de woordkeuze van elk later scherm (omzet vs. leads) en of budgetadvies überhaupt relevant is.
- **Geen data-eisen vooraf.** De gebruiker uploadt en hoort pas twee stappen later dat hij te weinig
  weken heeft. `mmm_core.ingestion.columns.validate_columns()` weet precies wat er nodig is; dat staat
  nergens vóór de upload.
- **De zakelijke context staat te laat en is overslaanbaar.** Het is de sterkste knop die een
  Bayesiaans model heeft (`priors.py` gebruikt hem direct), en hij zit achter een "typ overslaan".

### 2.9 Techniek

- Geen enkele frontend-test. `derivePhase`, `matchOption` en de `allows()`-poorten zijn pure functies
  en triviaal te testen; CI draait alleen lint/typecheck/build.
- `derivePhase` krijgt `configuration` binnen en gebruikt het nooit.
- `ChatWizard.tsx` doet streaming, upload, faselogica, voorstellen, Realtime én polling in één component.

---

## 3. Uitgangspunten voor de nieuwe opzet

1. **Wat werkt, blijft.** De deterministische fase-afleiding, de gesloten woordenschat
   (`ModelIntent`), de vier validatieniveaus en `allows()` als poort, de scheiding
   app / mmm-core / worker. Er verandert **niets** aan de statistiek.
2. **De flow is een traject, geen gespreksverloop.** Elke stap heeft een nummer, een naam, een
   duidelijk begin en een expliciet afgerond-moment dat in de database staat.
3. **De chat is het verhaal, de kaart is de handeling.** De gids schrijft; de gebruiker klikt of
   typt vrij. Een *keuze* krijgt een keuze-affordance. Vrij typen blijft altijd mogelijk voor vragen.
4. **Het transcript is permanent.** Alles wat is gezegd en besloten staat in de database en komt terug
   na een refresh, morgen, en op een andere computer.
5. **De gids is proactief en per stap begrensd.** Hij opent elke stap met wat er gaat gebeuren en
   sluit hem af met wat er is vastgelegd. Buiten zijn stap doet hij niets uit zichzelf.
6. **Interpretatie is de uitkomst, niet een extraatje.** Een afgeronde berekening levert automatisch
   uitleg in mensentaal, gelaagd, met het oordeel bovenaan.
7. **Niets onomkeerbaars zonder samenvatting vooraf.** Voor een berekening, een goedkeuring of een
   publicatie ziet de gebruiker eerst wat er gaat gebeuren.

---

## 4. De nieuwe flow

Acht stappen. De rail links/rechts toont ze altijd, met per stap: afgerond (met samenvatting van de
beslissing), bezig, of nog te doen.

### Stap 1 — Waar wil je antwoord op?
Eén kaart, drie keuzes (budget verdelen / effect per kanaal aantonen / periodieke rapportage) plus
"wat meet je?" (omzet, orders, leads, sessies). Duurt 15 seconden en bepaalt de woordkeuze van elk
volgend scherm en welke uitkomst straks vooropgezet wordt.
*Legt vast:* projectdoel + KPI-soort-hint.

### Stap 2 — Data aanleveren
Vóór de upload: een korte, concrete checklist (één rij per week, minimaal ~52 weken, één
KPI-kolom, één kolom per kanaal, datumkolom) met een voorbeeldtabel en een downloadbaar sjabloon.
Na de upload direct een leesbaar oordeel: dit is bruikbaar / dit kan met een aanpassing / dit gaat
niet werken en waarom.
*Legt vast:* `source_files` + profiel. *Poort:* de blokkerende bevindingen uit `validate_columns`.

### Stap 3 — Klopt wat ik zie?
Kolomkaart: per kolom de herkende rol en eenheid, met één klik te wijzigen. Geen dropdown-doolhof —
de AI-classificatie is het startpunt, de gebruiker bevestigt of corrigeert. Bij twijfelgevallen
(identifier-achtige kolom, GRP vs. euro's) vraagt de gids er expliciet naar, want dat is de fout die
later onzichtbaar is.
*Legt vast:* `mapping` + `inspection_confirmed_at`.

### Stap 4 — Data klaarmaken
De kwaliteitsbevindingen worden vertaald naar concrete beslissingen: "week 2025-W45 is drie keer zo
hoog als de weken eromheen — was dat een actie?" met de keuzes *laat staan / markeer als
bijzondere week / dat is een fout*. Dubbel-op-elkaar-lijkende kanalen, gaten en te korte reeksen
krijgen elk zo'n beslissing. Daarna één samenvoeging, één kwaliteitsrapport, één goedkeuring.
*Legt vast:* recept → `dataset_versions` → `approved_at`.

### Stap 5 — Wat weet jij al?
De belangrijkste stap, en nu de kortste. Twee delen:

**a. Over het bedrijf** — branche, marge per eenheid, bekende campagnes/seizoenspieken, eerdere
experimenten. Vrije tekst mag; de gids stelt gerichte vervolgvragen en legt vast via
`record_business_context`.

**b. Per kanaal drie vragen**, in gewone taal, met "weet ik niet" als volwaardig en zichtbaar
gelijkwaardig antwoord:
- *Werkt dit kanaal nog door nadat je stopt?* → `carryover`
- *Verwacht je hier veel of weinig effect van, vergeleken met de andere kanalen?* → `strength`
- *Als je hier morgen het dubbele in stopt — levert dat ook ongeveer het dubbele op?* → `saturation`

Plus twee vragen op modelniveau (seizoensgevoeligheid, welk deel van de omzet marketing volgens de
gebruiker drijft — de zwaarstwegende aanname, dus expliciet gevraagd in plaats van stilzwijgend
"moderate").

De AI-knop blijft: "vul dit voor me in op basis van mijn data en context" vult de kaart zichtbaar
in, met per antwoord de reden. De gebruiker wijzigt wat hij wil en bevestigt. Er is geen pad waarlangs
een AI-voorstel zichzelf toepast — dat blijft zoals het is.
*Legt vast:* `project_context` + `ModelIntent`.

### Stap 6 — Controleren en rekenen
Eén overzicht: dit is je KPI, dit zijn je kanalen met hun eenheid, dit heb je aangegeven, dit ga ik
berekenen, dit duurt ongeveer 3 à 5 minuten. Eén bevestigknop.

Tijdens de berekening: de zeven werkelijke stappen uit `RUN_STATE_SEQUENCE` in mensentaal, met
verstreken tijd en escalatie bij stilstand (dat werkt nu al goed en blijft). Vooraf uitgelegd wat er
kan gebeuren: als de aannamecontrole zegt dat je verwachtingen je eigen cijfers uitsluiten, stopt hij
daar — en dan is dat een antwoord, geen storing.
*Legt vast:* `model_configurations` + `model_runs`.

### Stap 7 — Wat zegt het model?
Automatisch gegenereerd zodra de run klaar is, in vier lagen. Elke laag hangt aan `allows()` — de
poortlogica verandert niet, alleen de volgorde en de taal:

1. **Kan ik hierop sturen?** Het oordeel, vertaald naar een handeling. Bij `technically_completed`:
   wat er mis is en welke stap dat oplost, met een directe link terug.
2. **Wat is er gebeurd?** Drie tot vijf zinnen: hoeveel van je KPI kwam door marketing, welk kanaal
   droeg het meeste bij, wat de bandbreedte is. Groot en eerst.
3. **Wat zou ik doen?** Alleen bij `usable_for_decisions`: budgetadvies en scenario's.
4. **De cijfers en de techniek.** Inklapbaar: de bestaande `SummaryView` / `ResultsCharts` /
   diagnostiek, ongewijzigd.

De gebruiker kan hier gewoon doorpraten ("waarom is TV zo onzeker?") — dat is waar de chat het
meeste waard is.

### Stap 8 — Delen
Publiceren naar het klantdashboard, of een rapport meenemen. Met wat de klant wél en niet te zien
krijgt, expliciet.

---

## 5. Technisch ontwerp

### 5.1 Datamodel (één migratie)

```sql
-- mmm.project_steps: het stappen-grootboek. Wat is besloten, wanneer, door wie.
create table mmm.project_steps (
  project_id uuid, step text, status text,        -- todo | active | done | stale
  summary jsonb,                                  -- mensleesbare samenvatting van de beslissing
  decided_at timestamptz, decided_by uuid,
  primary key (project_id, step)
);
```

`mmm.chat_messages` bestaat al en wordt uitgebreid met `step` en `kind`
(`guide` | `user` | `decision` | `result`), zodat het transcript herbouwd kan worden inclusief de
kaarten en beslissingen — niet alleen de AI-tekst.

Belangrijk: het grootboek is **geen tweede waarheid**. De harde feiten blijven afgeleid uit
`source_files` / `dataset_versions` / `model_runs`. Het grootboek voegt toe wat daar niet in staat:
*wat de gebruiker heeft besloten en wanneer*, en of een eerdere beslissing door een latere wijziging
verouderd is (`stale`).

### 5.2 Nieuwe modules

| Bestand | Verantwoordelijkheid |
|---|---|
| `lib/flow/steps.ts` | De acht stappen: id, label, wat de stap nodig heeft, wat hij oplevert, welk DB-feit hem afrondt. Eén bron voor rail, chat en dossier. |
| `lib/flow/state.ts` | `deriveFlowState(snapshot, ledger)` → per stap status + samenvatting + blokkades. Vervangt `derivePhase`. |
| `lib/flow/transcript.ts` | Transcript laden/schrijven; berichten zijn stap-verankerd. |
| `components/flow/FlowRail.tsx` | De permanente stappenbalk. |
| `components/flow/Conversation.tsx` | Het transcript, oudste boven, nieuwste onder, kaarten inline. |
| `components/flow/steps/*.tsx` | Eén kaart per stap (8 bestanden, elk klein). |
| `lib/ai/guide/*.ts` | Per stap een smalle, gecachete systeemprompt + het ene tool dat die stap kent. |
| `app/api/flow/route.ts` | Beslissing vastleggen + stap afronden + transcript-regel schrijven. Eén plek waar de flow vooruit gaat. |

### 5.3 Wat verdwijnt

- `lib/wizard/` (phase, script, questions, tuningDefaults, turns/*) — vervangen door `lib/flow/`.
- `components/wizard/ChatWizard.tsx` en `ModelDossier.tsx` — opgesplitst in rail, conversatie, kaarten.
- `app/api/prepare-auto/` — dode code.
- De monolithische architect-prompt — vervangen door per-stap prompts, met alle verwijzingen naar
  niet-bestaande velden eruit.

### 5.4 Wat blijft ongewijzigd

`packages/mmm-core/`, `worker/`, alle bestaande API-routes voor datasets/runs/publish,
`SummaryView` / `ResultsCharts` / `ScenarioPlanner`, het klantdashboard, en de RLS.

### 5.5 Losse reparaties die meegaan

- `GET /api/model-configurations/[id]` toevoegen (of de intent in de snapshot meenemen) zodat
  "hergebruik de afstemming van run N" werkt.
- Terugkoppeling markeert afhankelijke stappen als `stale` in plaats van stil inconsistent te worden.

---

## 6. Fasering

Elke fase eindigt met `npm run lint && npm run typecheck && npm run build`, plus: **alle zes invarianten
uit §8.2 groen op alle bereikbare toestanden**. De bestaande wizard blijft werken tot fase 3 klaar is;
daarna wordt hij in één keer verwijderd.

| Fase | Inhoud | Resultaat |
|---|---|---|
| **0. Fundament** | Migratie (`project_steps`, transcript-velden), `lib/flow/steps.ts` + `state.ts`, de zes invarianten en de route-bestaan-test | De flow-toestand is afleidbaar, en het net waarin elke latere fase valt hangt er al |
| **1. Skelet** | Rail, conversatie met persistent transcript, kaart-raamwerk, nieuwe projectpagina | Je kunt door een leeg traject lopen; alles blijft na refresh staan |
| **2. Data-stappen** | Stap 1 t/m 4 (doel, aanleveren, kolommen, klaarmaken) | Van CSV tot goedgekeurde dataset in de nieuwe flow |
| **3. Model-stappen** | Stap 5 en 6 (wat weet jij al, controleren en rekenen); oude wizard eruit | Volledige weg tot een lopende berekening |
| **4. Uitkomst** | Stap 7 en 8, automatische gelaagde interpretatie, stap-terug bij afgekeurd model, doorloop met een echte niet-technische gebruiker | De gebruiker begrijpt zijn uitkomst zonder te hoeven vragen — en dat is waargenomen, niet aangenomen |
| **5. AI-laag** | Per-stap prompts, opgeschoonde tools, prompt-drift weg | De gids is consistent en zegt niets over knoppen die niet bestaan |
| **6. Afronden** | Tests, `docs/ARCHITECTUUR.md` en `docs/HANDLEIDING.md` bijwerken, dode code weg | Klaar, gedocumenteerd, in CI geborgd |

Tests draaien op **vitest** (besluit 4 in §9) en dekken drie dingen: de invarianten uit §8.2 over alle
bereikbare toestanden, de simulatie-doorloop op de demo-CSV uit §8.3, en het golden transcript van de
gidsteksten. De CI-job `frontend` krijgt `npm test` naast lint, typecheck en build.

---

## 7. Wat dit oplevert, gemeten aan je vraag

| Jouw eis | Hoe dit plan dat waarmaakt |
|---|---|
| Bij de hand genomen van CSV tot begrepen uitkomst | Acht stappen met een vaste opening en afsluiting, en een uitkomst die zichzelf uitlegt (stap 7, laag 1 en 2) |
| Duidelijk zien in welke stap je zit | Permanente rail met afgerond/bezig/te doen + de samenvatting van elke genomen beslissing, uit de database |
| Een logische flow | Eén voorwaartse weg met expliciete poorten; terugkoppeling markeert wat verouderd is in plaats van stil te breken |
| Proactieve gids | De gids opent en sluit elke stap uit zichzelf, in plaats van alleen te reageren op wat niet matchte |
| Geen statistische kennis nodig | Geen enkel getal als invoer; alle vragen in gewone taal met "weet ik niet" als volwaardig antwoord; jargon alleen in de inklapbare vierde laag |
| Niet overlaten aan de LLM | Ongewijzigd: de LLM stelt voor in enums, code beslist. Sterker nog: de flow zelf wordt nu ook expliciet vastgelegd in plaats van impliciet af te leiden |

---

## 8. Hoe we een bugvrije, gestroomlijnde ervaring borgen

"Bugvrij" is geen belofte die iemand waar kan maken. Wat wél kan: de **categorieën** afsluiten
waarin de huidige fouten vallen, en wat overblijft toetsen met invarianten in plaats van met losse
testgevallen. De acht gevonden problemen in §2 zijn geen toevalligheden — het zijn acht categorieën
met elk een structurele oorzaak.

### 8.1 Laag 1 — De categorie onmogelijk maken

| Fout nu | Waarom hij kon ontstaan | Waarom hij straks niet uit te drukken is |
|---|---|---|
| Transcript weg na refresh | Gespreksverloop in React-state náást de waarheid in de database | Er is geen client-state meer voor het transcript; de conversatie wordt server-side gerenderd uit één tabel. Wat je niet in de client bewaart, kun je daar niet verliezen. |
| Getypte `1` betekent per stap iets anders; verouderd menu blijft geldig | Keuze wordt uit vrije tekst geraden, los van de stap waar hij bij hoort | Een keuze is een `{step, action}`-paar dat de server toetst tegen de *actieve* stap. Een actie voor een niet-actieve stap wordt geweigerd, niet verkeerd gelezen. De parser bestaat niet meer. |
| Tekst belooft proefdraai en geavanceerde instellingen | Copy is een los artefact naast de mogelijkheden | Wat de gebruiker kán doen, wordt gerenderd uit de gedeclareerde acties van de stap. Proza beschrijft alleen het waarom. Een knop die niet bestaat, kan niet in beeld komen. |
| `GET /api/model-configurations/[id]` bestaat niet | `fetch("/api/…")` is voor de compiler een string als elke andere | Alle aanroepen via één getypte client-module, plus een test die elke `/api/…`-string in de codebase naast de aanwezige routebestanden legt. |
| Prompt noemt velden die niet meer bestaan | Prompt is proza, tools zijn types — twee bronnen | Het deel van de prompt dat velden en toegestane waarden opsomt, wordt gegenereerd uit dezelfde enums als `lib/types.ts`. Een verwijderd veld verdwijnt automatisch uit de prompt. |
| Vinkje bij een overgeslagen stap | Afgeleid uit positie (`done = i < activeStep`) | Elke stap heeft een `isDone(snapshot, ledger)`-predikaat. Een vinkje is een feit, geen indexvergelijking. |
| Teruggaan breekt stilzwijgend wat erna kwam | Geen verouderingsmodel; client-only override | Elke stap declareert waar hij van afhangt. Een wijziging markeert afhankelijke stappen `stale` en toont dat. |
| `busy` / `delegatedBusy` / `pendingProposal` die uit de pas lopen | Handgerolde concurrency in vier losse booleans | Eén toestand per stap; de server is de autoriteit en geeft de nieuwe toestand terug. Er is geen tweede plek die kan afwijken. |

Acht van de acht zijn categorie-eliminaties, geen reparaties. Dat is de kern van de garantie: deze
fouten worden niet "minder waarschijnlijk", ze worden onuitdrukbaar.

### 8.2 Laag 2 — Zes invarianten, getoetst over álle bereikbare toestanden

Niet "we hebben een paar paden getest", maar: deze eigenschappen gelden voor elke toestand waarin de
flow kan komen. Samen zijn ze de operationele definitie van "gestroomlijnd".

1. **Nooit een doodlopende toestand.** Elke bereikbare toestand heeft minstens één zichtbare
   vervolgactie, óf een expliciet "dit is klaar". Dit is de invariant die "ik weet niet wat ik nu moet
   doen" onmogelijk maakt.
2. **De getoonde stap volgt uit de feiten.** Er is geen UI-tak die een stap toont die snapshot +
   grootboek niet ondersteunen.
3. **Geen getal zonder zijn oordeel.** Elke uitkomstlaag hangt aan `allows(validation, …)`. Getoetst
   over alle vier de niveaus × alle lagen: bij `not_usable` en `technically_completed` komt er geen
   enkel kanaalgetal doorheen.
4. **Elke fout heeft mensentaal én een uitweg.** Voor elke `RunErrorCode` en elke blokkerende
   kwaliteitscode bestaat een tekst én een actie die ergens naartoe leidt. De registers bestaan al
   (`lib/humanizeMessage.ts`, `lib/qualityIssueRegistry.ts`); dit maakt volledigheid een testbare eis.
5. **Onomkeerbaar betekent bevestigd.** Samenvoegen, goedkeuren, rekenen en publiceren zijn gemarkeerd
   als bevestigingsplichtig en kunnen alleen via een scherm dat vooraf toont wat er gaat gebeuren.
   Getoetst: geen enkele blijvende actie zonder die markering.
6. **Elke stap is af te ronden zonder te typen** — behalve de twee waar vrije tekst de inhoud zélf is
   (bedrijfscontext, en vragen aan de gids). Dit is de operationele definitie van "geen technische
   kennis nodig".

### 8.3 Laag 3 — De doorloop als test

- **Simulatie-doorloop (snel, in CI).** Eén test loopt als gebruiker de hele weg af op de meegeleverde
  demo-CSV (`demo_data/mediamarkt_demo_dataset.csv` — met opzet de lastige gevallen: `folder_oplage`
  en `email_verzendingen` zijn geen euro's, en die verwarring is precies wat een budgetadvies
  betekenisloos maakt), met de worker gemockt. Bij élke tussenliggende toestand worden de zes
  invarianten gecontroleerd. Dit is de test die de ervaring als geheel bewaakt in plaats van losse
  functies.
- **Echte doorloop (Playwright, nachtelijk of handmatig).** Dezelfde weg in een echte browser met een
  screenshot per stap. Vangt wat een unit-test niet ziet: layout, scrollgedrag, bereikbaarheid van een
  knop.
- **Golden transcript.** De vaste gidsteksten van alle acht stappen in één snapshotbestand. Een
  wijziging in de begeleiding wordt zichtbaar in de diff van een pull request, in plaats van pas bij
  een gebruiker.

### 8.4 De getallen in de interpretatie komen niet uit de LLM

Stap 7 laat de gids uitleggen wat de uitkomst betekent. Daar zit het enige echte hallucinatie-risico
van het hele product: een verzonnen percentage in een zin die verder klopt, is niet te onderscheiden
van een juist percentage.

Daarom: **elk getal in de interpretatie wordt door code gerenderd uit `FitSummary`**, met de bandbreedte
erbij; de gids schrijft uitsluitend de verbindende duiding eromheen. Een controle achteraf toetst dat
elk getal in de gegenereerde tekst herleidbaar is tot de samenvatting. Dit geldt ook voor de bestaande
`/api/analysis` en `/api/client-summary`.

### 8.5 Wat hiermee níét gegarandeerd is

Eerlijk, zodat de verwachting klopt:

1. **Of de teksten begrijpelijk zijn voor jouw doelgroep.** Geen enkele test vervangt één sessie met
   iemand die het product niet kent en zonder hulp het demo-project doorloopt. Dat is een expliciete
   oplevering van fase 4, niet een optioneel extraatje.
2. **De formulering van de gids.** De structuur is getest en de getallen zijn geborgd (§8.4); of een
   zin prettig leest, blijft een menselijk oordeel.
3. **Alles achter de startknop.** Worker en statistische kern blijven ongemoeid en hebben hun eigen
   suite (403 tests plus de herstelmatrix). De flow raakt ze alleen via bestaande routes.

### 8.6 Wat dit betekent voor de fasering

- Fase 0 levert de zes invarianten en de route-bestaan-test **vóór** er UI is, zodat elke latere fase
  eraan getoetst wordt in plaats van achteraf.
- Elke fase sluit af met "alle invarianten groen op alle bereikbare toestanden", niet alleen met
  lint / typecheck / build.
- De CI-job `frontend` krijgt `npm test` erbij.
- Fase 4 levert de gebruikersdoorloop met een echte niet-technische gebruiker op.

---

## 9. Vastgelegde besluiten

Bevestigd door de product owner voordat de bouw begint:

1. **Leesrichting van de eis.** De gids moet wél proactief elke stap openen en afsluiten, de stap moet
   altijd zichtbaar zijn, en er moet een logische flow zijn. De klachten in de opdracht beschreven de
   huidige toestand; het omgekeerde is de eis.
2. **Keuze-affordances.** De "alles moet getypt worden"-regel wordt losgelaten. Een keuze krijgt
   knoppen in de stapkaart; vrij typen blijft altijd mogelijk voor vragen en voor invoer die geen
   keuze is. Daarmee vervalt ook de heuristische menu-parser (`lib/wizard/questions.ts`) en de
   categorie bugs die eraan hangt.
3. **Stap 5 is verplicht**, niet overslaanbaar. Wel in ~60 seconden af te ronden: "weet ik niet" is
   overal een volwaardig, gelijkwaardig zichtbaar antwoord dat het model gewoon de data laat bepalen.
4. **Vitest wordt toegevoegd** voor de flow-logica: stap-afleiding, de poorten tussen stappen en de
   `allows()`-gating van de uitkomstlagen. Draait mee in CI naast lint, typecheck en build.
