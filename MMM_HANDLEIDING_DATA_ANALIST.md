# Handleiding — Een Media Mix Model uitvoeren met de MMM Wizard

**Voor wie:** data-analisten die vanaf nul een Media Mix Model (MMM) opzetten voor een
klant met de MMM Wizard-app. Je hoeft geen ervaren statisticus of data-engineer te zijn:
de app en de ingebouwde AI nemen het zware werk uit handen. Deze handleiding
geeft je (1) genoeg **theoretische bagage** om te begrijpen wat je doet en de klant goed
te adviseren, en (2) een **stap-voor-stap-werkwijze** door de hele app, van eerste upload
tot gepubliceerd klantdashboard.

**Wat je na deze handleiding kunt:** een klanttraject voorbereiden, ruwe data door de app
loodsen, een model configureren en fitten, de kwaliteit van een resultaat beoordelen, en
de uitkomst — inclusief onzekerheid — vertrouwenwekkend aan een klant presenteren.

> **Twee gerelateerde documenten.** `MMM_README.md` geeft het projectoverzicht;
> `MMM_APP_OVERDRACHTSDOCUMENT.md` beschrijft de volledige technische as-is-implementatie.
> Deze handleiding is de *praktische gebruikersgids* — lees die twee als je onder de motorkap
> wilt kijken.

---

## Inhoud

1. [Theorie: wat is een Media Mix Model?](#1-theorie-wat-is-een-media-mix-model)
2. [Voorbereiding met de klant (vóór de app)](#2-voorbereiding-met-de-klant-vóór-de-app)
3. [De app leren kennen: rollen, toegang, opzet](#3-de-app-leren-kennen-rollen-toegang-opzet)
4. [De wizard, stap voor stap](#4-de-wizard-stap-voor-stap)
5. [De AI-lagen: Claude als co-piloot door de hele pijplijn](#5-de-ai-lagen-claude-als-co-piloot-door-de-hele-pijplijn)
6. [Resultaten beoordelen: de kwaliteitscontrole en diagnostiek](#6-resultaten-beoordelen-de-kwaliteitscontrole-en-diagnostiek)
7. [Publiceren en presenteren aan de klant](#7-publiceren-en-presenteren-aan-de-klant)
8. [Iteratie & veelvoorkomende problemen](#8-iteratie--veelvoorkomende-problemen)
9. [Naslag: begrippenlijst](#9-naslag-begrippenlijst)
10. [Snelchecklist per traject](#10-snelchecklist-per-traject)

---

## 1. Theorie: wat is een Media Mix Model?

### 1.1 Het probleem dat een MMM oplost

Een marketeer geeft geld uit aan meerdere kanalen tegelijk — Google, social, tv, radio,
e-mail — en wil weten: **wat leverde elk kanaal daadwerkelijk op, en waar kan de volgende
euro het beste heen?** Simpele attributie (bijvoorbeeld "de laatste klik krijgt de
verkoop") schiet tekort: het negeert kanalen die vraag *opbouwen* zonder de laatste klik
te zijn, het houdt geen rekening met seizoen, prijs, of vertraagde effecten, en het kan
niet met offline media (tv/radio) overweg.

Een **Media Mix Model** benadert dit van bovenaf. Het verklaart de wekelijkse KPI
(bijvoorbeeld omzet of leads) uit alles wat die KPI beïnvloedt: marketinguitgaven per
kanaal, een basislijn (wat je sowieso zou verkopen), trend, seizoen en andere factoren
zoals prijs. Uit dat model komt per kanaal een **contributie** (hoeveel KPI het opleverde)
en een **ROAS** (opbrengst per uitgegeven euro).

> **Kernonderscheid dat je de klant moet uitleggen:** een MMM meet *contributie*, niet
> *correlatie*. Twee kanalen kunnen samen stijgen door seizoen; het model probeert juist te
> ontrafelen welk deel van de KPI écht aan een kanaal toe te schrijven is, gecorrigeerd voor
> alle andere factoren.

### 1.2 Waarom Bayesiaans — en waarom onzekerheid centraal staat

De app gebruikt een **Bayesiaans** MMM (gebouwd op PyMC). Dat betekent twee dingen die je
moet kunnen navertellen:

- **Priors (voorkennis).** Voordat het model de data ziet, geef je het redelijke
  verwachtingen mee — bijvoorbeeld "een kanaal heeft doorgaans een bescheiden, positief
  effect" of, als er een experiment is gedaan, "de ROAS van dit kanaal ligt rond 3". De
  data past die verwachtingen vervolgens aan. Dit maakt het model stabiel, ook bij weinig
  data, en laat je harde kennis (experimenten, branchekennis) netjes meewegen.
- **Onzekerheid als uitkomst, niet als voetnoot.** Het model geeft nooit één kaal getal,
  maar een **verdeling**. In de app zie je overal een **mediaan met een 94%
  betrouwbaarheidsinterval** (credible interval), genoteerd als `(p3, p50, p97)`. Dat is
  eerlijk: "de ROAS van Google is waarschijnlijk 3,2, maar realistisch ligt hij tussen 2,1
  en 4,5". Brede intervallen = weinig zekerheid; smalle intervallen = het model is
  overtuigd.

Deze onzekerheid is geen zwakte om te verbergen — het is je sterkste
presentatie-instrument (zie §7).

### 1.3 De vier kernconcepten die elk MMM stuurt

Deze vier begrippen kom je in elke stap van de app tegen. Snap ze, en je snapt het model.

1. **Adstock (carry-over / na-ijl).** Marketing werkt niet alleen in de week dat je
   betaalt; het effect *ijlt na*. Een tv-campagne werkt weken door. Adstock modelleert dat
   met een **halfwaardetijd**: hoe lang duurt het tot de helft van het effect is
   weggeëbd. Twee vormen:
   - `geometric` — het effect piekt **direct** en neemt dan af. Standaard voor digitale
     kanalen (search, social).
   - `delayed` — het effect **bouwt eerst op** en piekt pas na enkele weken. Voor
     tv, radio, out-of-home, soms video.
2. **Saturatie (afnemend rendement).** De eerste euro's in een kanaal werken hard; naarmate
   je meer uitgeeft, levert elke extra euro minder op — de curve buigt af. Dit is waarom
   "meer budget" niet lineair meer omzet geeft. Twee vormen:
   - `hill` — flexibel, kan een S-curve aannemen. Standaard.
   - `logistic` — één parameter minder, robuuster bij weinig of ruisige data.
3. **Baseline.** Wat je zou verkopen zónder enige marketing: intercept + **trend**
   (langzame op-/afbouw) + **seizoen** (terugkerend jaarpatroon) + **controls** (bijv.
   prijs). Alles wat níét aan een kanaal toe te schrijven is, hoort hier — cruciaal, want
   anders krijgen kanalen ten onrechte de eer voor een goede kerstmaand.
4. **Response curves & (marginale) ROAS.** Uit de gefitte saturatiecurves berekent het
   model per kanaal een **response curve** (contributie bij oplopende spend), de
   **marginale ROAS** (wat de vólgende euro oplevert, = de helling op je huidige punt) en
   een **optimale budgetherverdeling**. Dit is de brug van "wat wérkte" naar "wat moet ik
   nu doen".

### 1.4 Wat een MMM wel en niet kan (verwachtingsmanagement)

Zeg dit vroeg tegen de klant, het voorkomt teleurstelling:

- **Wel:** de relatieve bijdrage en efficiëntie van kanalen op weekniveau, inclusief
  offline; effect van afnemend rendement; onderbouwd budgetadvies; alles met eerlijke
  onzekerheid.
- **Niet:** individuele klantreizen of last-click-attributie; effecten op dagniveau of per
  advertentie; harde causaliteit zonder experiment (een MMM is correlationeel-met-controls,
  geen gerandomiseerd experiment); betrouwbare uitspraken over budgetten ver buiten wat
  historisch is uitgegeven (extrapolatie wordt in de grafieken expliciet gemarkeerd).
- **Randvoorwaarde:** je hebt genoeg **weken historie** nodig. Onder ~26 weken worden de
  onzekerheidsmarges breed; onder ~52 weken is seizoen lastig te schatten. Meer variatie in
  spend per kanaal = het model kan het effect beter losweken.

---

## 2. Voorbereiding met de klant (vóór de app)

Het model is zo goed als de data die erin gaat. Een groot deel van je toegevoegde waarde
zit in deze fase — nog voordat je iets uploadt.

### 2.1 Welke data verzamel je?

Vraag de klant om **wekelijkse** data (de app aggregeert desnoods dag → week, maar week is
het niveau van het model), met per week minstens:

| Type | Wat | Voorbeeld |
|---|---|---|
| **KPI** (doelvariabele) | De uitkomst die je wilt verklaren | Omzet (€), of aantal leads/orders |
| **Spend per kanaal** | Uitgaven of volume per marketingkanaal, elk in een eigen kolom | `google_spend`, `meta_spend`, `tv_grps`, `email_sends` |
| **Controls** (optioneel maar waardevol) | Andere verklarende factoren die geen eigen kanaal-effect krijgen | prijs, kortingspercentage, voorraad, weer |

Spend hoeft niet monetair te zijn: e-mailverzendingen, tv-GRP's of impressies zijn ook
prima "spend"-kolommen. Meerdere losse bestanden (bijv. één per bron) is geen probleem —
de app voegt ze samen.

### 2.2 Zakelijke context ophalen (prior-elicitatie)

Dit is de meest onderschatte, meest waardevolle stap. Een Bayesiaans model wordt
**substantieel beter** als je weet wat er achter de data zit. Vraag de klant actief naar:

- **Branche/seizoensdrukte** — wanneer piekt de vraag? (webshop rond kerst/Black Friday,
  reisbranche in het voorjaar, enz.)
- **Bekende campagnes/acties** — grote eenmalige uitschieters in een specifieke week
  (productlancering, sale, storing).
- **Offline kanalen met lange nawerking** — tv, radio, out-of-home. Die krijgen straks
  `delayed` adstock en een langere carry-over.
- **Experimenten** — is er ooit een lift-test of geo-experiment gedaan met een gemeten
  ROAS? Dat is goud: je kunt het model daarmee **kalibreren** (§4.4).

Je hoeft dit niet zelf te onthouden: geef deze feiten door aan de AI in de chat,
en die legt ze vast en vertaalt ze naar concrete modelinstellingen (priors, kalibratie,
kanaaltype).

### 2.3 Verwachtingen zetten

Spreek vooraf af: MMM levert **richting en onderbouwing**, geen exacte euro's tot achter de
komma. Beloof geen "40% meer omzet"; beloof een eerlijk beeld van welke kanalen werken en
waar budget verschuiven kan lonen — mét de bandbreedte van onzekerheid. Vertel ook dat het
een **iteratief** traject is: een eerste fit is een startpunt, geen eindpunt.

---

## 3. De app leren kennen: rollen, toegang, opzet

### 3.1 Twee strikt gescheiden rollen

- **Bouwer** (dat ben jij, de analist): ziet en doet alles — ruwe data, tussenresultaten,
  mislukte fits, chat, configuratie, publiceren. Je account heeft een `is_builder`-vlag.
- **Klant**: ziet uitsluitend het **gepubliceerde** dashboard van het eigen project. Nooit
  chat, nooit ruwe data, nooit andere klanten. Dit wordt afgedwongen door de database
  (Row Level Security), niet alleen door de UI — een klant die een project-URL raadt, komt
  er niet in.

> **Toegang regelen.** Wie bouwer is en welke klant toegang krijgt tot welk project, wordt
> in de database geregeld (tabellen `mmm.app_users` en `mmm.project_access`); daar is
> bewust géén scherm voor in de app. Vraag je beheerder om je e-mail als builder te
> registreren en om een klant aan een project te koppelen wanneer je klaar bent om te delen.

### 3.2 Inloggen en een project aanmaken

1. Ga naar de app en log in via **`/login`** (e-mail/wachtwoord of magic link).
2. Je komt op **`/projects`**: de lijst met projecten (elk met zijn actuele pipelinefase).
   **Eén project = één klantmodel.**
3. Maak een nieuw project aan met een **naam** en optioneel de **klantnaam** — of klik
   **"start een demo-project"**: dan staat er direct een oefenproject klaar met de
   meegeleverde MediaMarkt-demodata, ideaal om de wizard te leren kennen of een training
   te beginnen. Elke stap toont bovenaan een korte spiekbrief (wat doe je hier en waarom);
   deze handleiding blijft het naslagwerk.
4. Open het project. Je ziet nu de **wizard**: een verticale stappen-pijplijn (op desktop
   met een railnavigatie links, op mobiel een compacte voortgangsregel) met daarnaast een
   **chatpaneel** met de AI.

Elke stap heeft een automatisch afgeleide status — *vergrendeld / beschikbaar / actief /
aandacht nodig / klaar* — zodat je altijd ziet welke stap nu aan de beurt is. Je hoeft niets
handmatig bij te houden.

---

## 4. De wizard, stap voor stap

De pijplijn heeft vier stappen: Data uploaden, Data voorbereiden (met daarin het optionele verken-paneel), Model configureren (met het zakelijke-contextpaneel) en Berekenen & resultaten (met publiceren als afsluiting). Je werkt ze van boven naar beneden af; de AI in de chat
(§5) helpt bij vrijwel elke stap.

### Stap 1 — Data uploaden

- Sleep of kies je bestanden (**CSV of XLSX**). Elk bestand gaat naar de beveiligde opslag
  en verschijnt in de lijst.
- Voor CSV's toont de app meteen een client-side **"sniff"**: aantal rijen, kolommen en het
  datumbereik — zonder serverronde, dus direct.
- Je kunt bestanden weer verwijderen (met bevestiging).

**Wat er automatisch op de achtergrond gebeurt (nieuw):** zodra je een CSV uploadt, doet de
app twee dingen ongevraagd, zodat de AI straks met een voorsprong start:

- **Automatische kolom-classificatie** — een goedkope, snelle AI-call (Claude Haiku) bepaalt
  per kolom de vermoedelijke **rol, eenheid, granulariteit en vorm** (breed/lang). Deze
  classificatie wordt bij het bestand bewaard en door de AI in de chat meegelezen, zodat
  zijn samenvoegrecept al met een betrouwbare mapping begint.
- **Rijk statistisch profiel** — de app berekent per bestand een *volledige-reeks-profiel*
  (min/max/gemiddelde/sd, ontbrekende weken + langste gat, uitschieters **mét exacte week en
  waarde over de héle periode**, en sterk gecorreleerde kolommen). Waar de preview alleen de
  eerste rijen ziet, ziet dit profiel álles — de AI kan er dus een uitschieter uit
  week 45 mee benoemen die je in de preview nooit had gezien.

**Tip:** upload alle relevante bronnen in één keer (KPI-bestand, spend-bestand(en),
controls). De AI leest ze samen — inclusief classificatie en profiel — en stelt
straks een compleet samenvoegrecept voor.

### Stap 2a — Data verkennen (uitklapbaar paneel in stap 2, optioneel)

Volledig in je browser, **geen AI en geen serverronde** — puur om zelf een gevoel bij de
data te krijgen. Per gekozen CSV kun je:

- een **grafiek** samenstellen (lijn/staaf, meerdere y-kolommen als "small multiples");
- **kolomstatistieken** bekijken (aantal, ontbrekend, gemiddelde, mediaan, std, kwartielen)
  met histogram;
- een **correlatiematrix** tussen alle numerieke kolommen zien.

> **Waar je op let:** sterk gecorreleerde **spend**-kolommen (bijv. twee kanalen die altijd
> samen op en neer gaan). Het model kan hun effecten dan moeilijk los schatten
> (multicollineariteit). Onthoud welke dat zijn — je wilt er straks misschien één weglaten
> of combineren.

### Stap 2 — Data voorbereiden (samenvoegen tot de definitieve dataset)

Dit is de belangrijkste datavoorbereidingsstap. Doel: van losse, rommelige bestanden naar
**één schone, wekelijkse master-tabel** waarop het model kan draaien.

Per geüpload bestand stel je in:
- de **datumkolom** (of laat de app hem detecteren);
- optionele **opschoon-/hervormstappen** (transforms) — hernoemen, kolommen droppen, filteren,
  eenheden omrekenen (centen→euro's), een "lang" bestand naar "breed" pivoteren, een
  dubbelzinnig datumformaat forceren, enz.;
- per kolom een **rol**: **KPI** / **spend** / **control** / niet gebruiken. Voor
  controls kies je desgewenst een **fill-strategie** voor ontbrekende weken
  (`zero`/`ffill`/`bfill`/`interpolate`/`mean`/`median`).

Verder kun je in uitklapbare secties **event-dummy's** (0/1-markering voor een specifieke
uitschieterweek) en **afgeleide variabelen** (features zoals lag, voortschrijdend gemiddelde,
ratio, terugkerende kalenderdummy) beheren.

**Werkwijze (AI-eerst):** bovenaan de stap staat de primaire knop **"Bereid automatisch
voor (AI)"** — de AI kiest rollen, voegt samen en verfijnt tot het
kwaliteitsrapport schoon is (max. 3 rondes); jij controleert en keurt goed. Wil je meer
regie, werk dan handmatig:
1. Vul het recept in — of laat de AI het voorstellen (§5) en neem het met één klik
   over (met **"Ongedaan maken"** als het tegenvalt). Elke kolom zonder rol toont een
   klikbare **"AI:"-badge** met de automatische classificatie (rol + zekerheid), en per
   bestand kun je **"Alle AI-suggesties overnemen"** — altijd klikbaar, nooit stilzwijgend
   toegepast. Via een knop per bestand vraag je de AI om opschoonstappen (transforms).
2. Let op de gratis, direct berekende **datakwaliteitsmeter** (goed / redelijk / zwak). Die
   waarschuwt al vóór het samenvoegen bij te weinig weken of te veel ontbrekende waarden.
3. Klik **"Controleer & voeg samen"**. Dit start een `prepare`-job; de status
   (*concept → bezig → klaar/mislukt*) komt live binnen.
4. Bekijk het **kwaliteitsrapport** en de **preview-tabel**. Het rapport meldt in gewone
   taal wat er gebeurde: gekozen analysevenster, bijna-identieke kanalen (correlatie boven
   een drempel), jaarwisseling-anomalieën, en lokale KPI-uitschieters **met exacte week en
   waarde**. Elke ingreep (imputatie, hernoemen, vullen) staat er expliciet in — er wordt
   nooit iets stil gemuteerd.
5. Ben je tevreden? Klik **"Goedkeuren als definitieve dataset"**. Pas dan mag de dataset
   als input voor een model dienen.

**Diepe data-inspectie (nieuw — Claude krijgt écht ogen op de data).** In deze stap zit een
knop **"Diepe data-inspectie (ruwe bronnen)"** — en, zodra er een master bestaat, **"Diepe
data-inspectie (master)"**. Die geeft de data aan Claude in een **afgeschermde, netwerkloze
code-sandbox**, waar het met echte Python (pandas) de volledige dataset verkent: seizoen,
niveaubreuken, uitschieters, multicollineariteit. Tijdens het draaien toont de knop *"Claude
onderzoekt de data…"*; daarna verschijnt bijvoorbeeld *"Inspectie klaar — 4 bevinding(en). De
AI leest ze nu mee in de chat."* De bevindingen worden opgeslagen en gaan automatisch
mee in de context van de AI in de chat. Dit is de zware, expliciet getriggerde tegenhanger
van het gratis, automatische profiel uit stap 1 — gebruik hem bij twijfelachtige of complexe
data.

**Agentic auto-verfijn (nieuw — de triviale rondes zonder mens in de lus).** Normaal is elke
verbeterronde een handmatige stap: AI stelt recept voor → jij voegt samen → jij leest
het rapport → AI corrigeert. Voor de *triviale* correcties (verkeerd datumformaat,
vergeten fill, verkeerde kolomrol) kan de AI deze lus nu **zelf** doorlopen: hij stelt
een recept voor, het draait, het **kwaliteitsrapport gaat als echte tool-uitkomst terug**, en
hij corrigeert net zolang tot het rapport schoon is (met een harde limiet op het aantal
rondes). Belangrijk: dit levert een **voorbereide** (niet goedgekeurde) dataset op — de
mens-in-de-lus blijft: **jij** beoordeelt en klikt uiteindelijk "Goedkeuren". Het bespaart je
alleen de saaie tussenrondes.

**Wat er onder de motorkap gebeurt (zodat je het kunt navertellen):** de app lijnt alle
bronnen uit op ISO-weken (maandag als indexdatum), sommeert KPI en spend per week, middelt
controls, bepaalt het **overlappende venster** waarin élke essentiële bron data heeft, en
zet pas *binnen* dat venster ontbrekende spend-weken op 0 ("dit kanaal liep toen niet").
Gaten in KPI of controls worden nooit stilzwijgend gevuld.

### Stap 3 — Model configureren (met zakelijke context)

Met een goedgekeurde dataset verschijnt een ingevuld configuratieformulier, met bovenaan
de primaire knop **"Stel een configuratie voor (AI)"**: de AI vult het
formulier op basis van álle context (profiel, inspectie, zakelijke feiten); jij
controleert, stelt bij en start de fit. Overgenomen voorstellen zijn met één klik
**ongedaan te maken**. Je kunt uiteraard ook alles handmatig zetten — hier vertaal je de
theorie uit §1 naar concrete instellingen.

**Per model:**
- **KPI** — kies de doelkolom.
- **Ruismodel (likelihood):**
  - `normal` — standaard, voor een continue KPI (omzet).
  - `student_t` — als de KPI duidelijke uitschieters/pieken heeft (robuuster).
  - `poisson` / `negative_binomial` — als de KPI een **telling met lage aantallen** is
    (bijv. 5–50 leads/week). Kies `negative_binomial` bij overdispersie (sterker schommelend
    dan Poisson toelaat). *Let op:* voor tellingsmodellen worden response curves /
    budgetoptimalisatie (nog) niet berekend.
- **Trend:** `linear` (standaard) of `piecewise` bij een duidelijke structurele knik in de
  basislijn (herpositionering, marktverandering). Bij piecewise stel je het aantal knikpunten
  in (standaard 6).
- **Seizoen:** aan (standaard, jaarlijks = 52 weken) als de KPI een terugkerend patroon
  heeft; expliciet uit te zetten; aantal Fourier-modes bepaalt hoe fijn het patroon mag zijn
  (hou dit laag bij weinig data om overfitting te voorkomen).

**Per kanaal:**
- **Kanaaltype:** `intent` (vangt bestaande koopintentie — merkzoekwoorden, marktplaatsen),
  `brand` (bouwt nieuwe aandacht op — social prospecting, display), of `generic` bij twijfel.
- **Adstock:** `geometric` (digitaal, standaard) of `delayed` (offline/merk). Optioneel:
  `l_max` (max carry-over in weken, standaard 12 — verhoog voor offline) en
  `expected_half_life` als je concrete kennis hebt.
- **Saturatie:** `hill` (standaard) of `logistic` (robuuster bij weinig data).

**Controls:** vink de control-kolommen aan die je wilt meenemen (bijv. prijs).

**Sampling-preset** (rekenzwaarte van de fit):

| Preset | Draws / tune / chains | Wanneer |
|---|---|---|
| **Snel (verkennen)** | 300 / 300 / 2 | Snel itereren; onzekerheidsmarges nog niet scherp |
| **Standaard** | 1000 / 1000 / 4 | Goede balans — je standaardkeuze |
| **Grondig** | 2000 / 2000 / 4 | Definitieve run vóór publicatie |

**Extra betrouwbaarheidschecks (nieuw).** In het uitklapbare paneel *"Extra
betrouwbaarheidschecks"* kun je twee onafhankelijke controles aanzetten die met de fit
meelopen:
- **Cross-validatie** — het model wordt getest op weken die het niet gezien heeft
  (out-of-sample), zodat je ziet of het generaliseert of overfit.
- **Placebo-test** — een nepkanaal zonder echt effect wordt toegevoegd; als het model daar
  toch effect aan toeschrijft, is dat een waarschuwing dat de schattingen te gretig zijn.

Laat ze standaard uit voor snelle iteraties; zet ze aan voor de run die je wilt vertrouwen.

> Zonder goedgekeurde dataset verwijst deze stap je eerst terug naar stap 3; de directe
> **JSON-editor** tegen de ruwe bestanden bestaat nog, maar bewust alleen achter een
> "geavanceerd"-uitklap. Met goedgekeurde dataset zijn formulier en JSON onderling omzetbaar.

Klik **"Start modelberekening"** om een `fit`-job aan te maken.

#### 4.5 Prior-predictive check vóór de fit (nieuw — bespaar dure rekentijd)

Een echte Bayesiaanse fit kost minuten aan rekentijd (Modal-compute). Voordat je die uitgeeft,
kan de AI een **prior-predictive review** laten draaien: een *goedkope* check (géén
volledige sampling) die berekent welk **KPI-bereik jouw gekozen priors impliceren** — nog
vóórdat het model de echte data heeft gezien. Zijn de priors zo ingesteld dat het model omzet
verwacht die tien keer te hoog of negatief is, dan zie je dat hier, en corrigeert de AI
de configuratie *vóór* er dure compute wordt gespendeerd. De uitkomst van deze check wordt
automatisch meegelezen door de AI in de chat. Vraag er in de chat om (bijv. "controleer
eerst of mijn priors realistische omzet impliceren") wanneer je een ongebruikelijke config of
handmatig aangepaste priors gebruikt.

#### 4.4 Fijnafstemming (optioneel — alleen met reden)

Het formulier (en de AI) bieden fijnafstemvelden. **Grondregel: laat elk fijnafstem-
veld weg tenzij je een concrete, uitlegbare reden hebt** — weglaten betekent "gebruik de
geteste standaard". Een eerste fit laat priors en kalibratie vrijwel altijd op standaard.

- **Priors** — de "sigma"-schalen op componenten. Verklein een sigma om een component dicht
  bij nul te houden; vergroot om de data meer te laten bewegen. Alleen aanraken met echte
  kennis.
- **Kalibratie** — heeft de klant een **echt lift-/geo-experiment** met een gemeten ROAS?
  Vul dan per kanaal de gemeten `roas` en de onzekerheid `sd` in. Dit trekt de schatting
  zacht naar het experiment zonder de data te overrulen. Zonder experiment: weglaten.

### Stap 4 — Berekenen & resultaten (de berekening volgen)

Een fit duurt minuten en draait asynchroon op een aparte rekenlaag (Modal), dus je kunt
gerust wachten of iets anders doen. In deze stap zie je een **live lijst** van fit-jobs met:
- een **faselabel** (brondata laden → dataset opbouwen → model fitten → resultaten opslaan),
- een lopende teller,
- de mogelijkheid een nog-wachtende (niet: al lopende) job te annuleren.

Er draaien maximaal twee jobs tegelijk; extra fits komen in de wachtrij.

**Proactieve terugkoppeling (nieuw).** Zodra een fit die je ziet lopen klaar is of faalt,
hoef je niet meer zelf naar de chat: de AI meldt zich vanzelf — het chatpaneel
klapt open en hij beoordeelt het resultaat (of diagnosticeert de fout) direct.

**Automatische verbetercyclus (nieuw).** Boven de fit-lijst staat de knop **"Automatische
verbetercyclus"**. Zet je die aan bij een mislukte of zwakke fit (kwaliteitscontrole
warn/fail), dan doorloopt de AI de dure iteratielus zelf: diagnose → gecorrigeerde
config → nieuwe fit → opnieuw beoordelen, tot de poort op *pass* staat of de limiet van
**3 rondes** is bereikt. Elke ronde is als gewoon gesprek zichtbaar in de chat, je kunt op
elk moment stoppen, en goedkeuren/publiceren blijft altijd aan jou. Let op: elke ronde
kost een volledige fit aan rekentijd — gebruik dit gericht, niet standaard.

### Stap 4 (vervolg) — Resultaten beoordelen en publiceren

Zodra een fit klaar is, verschijnt hier het resultaat. Onderdelen:

- **Run-historie** — alle runs van dit project, met een twee-op-twee-vergelijkingstabel
  zodat je configuraties tegen elkaar kunt afwegen, en per run een knop **"config
  hergebruiken"** die stap 4 vult met de exacte configuratie van die run als startpunt
  (iteratiediscipline: één ding tegelijk veranderen).
- **Kwaliteitscontrole-banner** — spreekt alléén als er iets mis is (zie §6). Groen/stil =
  vertrouwbaar.
- **Kernstatistieken** met begrijpelijke tooltip-uitleg (een ingebouwd glossarium — zie §9).
- **Grafieken** (`ResultsCharts`): aandeel en ROAS per kanaal **met onzekerheidsmarge**,
  response-/verzadigingscurves, efficiency-frontier, en budgetherverdelingsadvies.
- **Tabel per kanaal** — contributie, aandeel, ROAS, adstock-halfwaardetijd,
  verzadigingspunt, elk als `(p3, p50, p97)`.
- **"Genereer diepgaande analyse"** — een optionele knop die Claude (in een afgeschermde
  sandbox, alleen op basis van de resultaat-JSON — geen ruwe klantdata) een geschreven
  Nederlandstalige interpretatie **plus** extra grafieken laat maken. Handig als bijlage bij
  je presentatie.
- **"Schrijf klantsamenvatting" (nieuw)** — laat Claude een presentatieklare samenvatting
  in klanttaal schrijven volgens de presentatievolgorde uit §7 (kwaliteit → contributie →
  onzekerheid → advies → vervolgstap), op basis van alleen de resultaat-JSON. Kopieer 'm
  1-op-1 in je rapport of slides en pas aan waar nodig — jij blijft de afzender.
- **Vergelijken via de chat (nieuw)** — de AI ziet nu ook de eerdere runs van het
  project. De snelactie *"Vergelijk met eerdere runs"* laat hem beargumenteren of de
  laatste fit écht beter is en welke run hij zou publiceren.
- **Publiceren** — zet deze run live voor de klant (§7).

---

## 5. De AI-lagen: Claude als co-piloot door de hele pijplijn

> **Belangrijk — recent sterk uitgebreid.** De AI-ondersteuning is niet één chatbot meer,
> maar een set samenwerkende lagen die Claude **maximaal laten meekijken vóórdat er dure
> rekentijd wordt gebruikt** ("meer ogen & meer brains"). Onderstaande sectie beschrijft ze
> allemaal. De rode draad blijft ongewijzigd: **Claude stelt voor en interpreteert, jij
> klikt** — mens-in-de-lus op elke onomkeerbare stap, en de statistische wiskunde zelf staat
> vast in de geteste kern (Claude *parametriseert*, rekent nooit zelf).

### 5.1 Overzicht: waar zit welke AI-hulp?

| Laag | Wanneer | Model | Wat het doet | Handmatig of automatisch? |
|---|---|---|---|---|
| **Kolom-classificatie** | Bij elke CSV-upload | Claude Haiku | Raadt per kolom rol/eenheid/granulariteit/vorm | Automatisch (achtergrond) |
| **Rijk dataprofiel** | Bij elke upload | (geen AI, deterministisch) | Volledige-reeks-statistiek + uitschieters mét week/waarde | Automatisch |
| **AI in de chat** | Elke stap, in het chatpaneel | Claude Sonnet | Stelt recept/config voor, interpreteert rapport & fit, elicit-eert context | Jij vraagt, jij neemt over |
| **Diepe data-inspectie** | Knop in stap 3 | Claude Sonnet (code-sandbox) | Verkent de volledige data met pandas | Handmatig (knop) |
| **Agentic auto-verfijn** | Stap 3 | Claude Sonnet | Loopt de triviale samenvoeg-correctierondes zelf | Handmatig gestart, dan autonoom |
| **Prior-predictive check** | Vóór de fit (stap 4) | (kern-berekening, AI leest terug) | Checkt welk KPI-bereik je priors impliceren | Op verzoek |
| **Proactieve fit-terugkoppeling** | Zodra een fit klaar is of faalt (stap 5) | Claude Sonnet | Beoordeelt het resultaat of diagnosticeert de fout — ongevraagd, de chat klapt open | Automatisch |
| **Auto-verbetercyclus (fit)** | Knop in stap 5 | Claude Sonnet | Corrigeert een mislukte/zwakke fit zelf en fit opnieuw (max. 3 rondes) | Handmatig gestart, dan autonoom |
| **Diepgaande analyse** | Knop in stap 6 | Claude Sonnet (code-sandbox) | Geschreven interpretatie + extra grafieken van het resultaat | Handmatig (knop) |
| **Klantsamenvatting** | Knop in stap 6 | Claude Sonnet | Presentatieklare samenvatting in klanttaal voor je rapport/slides | Handmatig (knop) |

### 5.2 De AI in de chat (de kern)

Naast de pijplijn staat het chatpaneel met de **AI**: een MMM-expert die drie petten
draagt, afhankelijk van waar je bent:

- **Data prep:** stelt een compleet **samenvoegrecept** voor (welke kolom welke rol, welke
  transforms, event-dummy's, features), en leest na het samenvoegen het kwaliteitsrapport
  terug — benoemt uitschieters met exacte week + waarde en stelt gericht fixes voor.
- **Modelconfig:** stelt een complete **modelconfiguratie** voor op basis van kolomnamen, het
  automatische profiel, de kolom-classificatie, eventuele diepe-inspectiebevindingen én jouw
  zakelijke context.
- **Resultaten:** interpreteert een fit in gewone taal (welke kanalen werken, is het model
  betrouwbaar), benoemt eerlijk de onzekerheid, en biedt bij een zwakke of mislukte fit een
  gecorrigeerde config aan met de vermoedelijke oorzaak erbij.

**Rijkere context dan voorheen.** De AI krijgt tegenwoordig niet alleen de eerste 15
regels van elk bestand, maar ook: het **volledige-reeks-profiel**, de **kolom-classificatie**,
de bevindingen van de **diepe data-inspectie**, de vastgelegde **zakelijke context**, een
referentie van **terugkerende NL-kalendergebeurtenissen** (Black Friday, kerst, vakanties) en
de uitkomst van de **prior-predictive check**. Daardoor zijn zijn voorstellen concreter en
minder giswerk — hij ziet een uitschieter in week 45 die niet in de preview stond, of twee
bijna-identieke kanalen, en benoemt die uit zichzelf.

**Fijner samenwerken (nieuw):** antwoorden **streamen** live het paneel in (met een
stop-knop), boven de chat staat een regel **"AI ziet: …"** die precies toont welke
context hij meeleest (bestanden, datasetstatus, laatste fit, vastgelegde contextfeiten,
inspectie) — zo weet je waar je naar kunt verwijzen — en vanuit het kwaliteitsrapport en
de kwaliteitscontrole kun je met één klik een voorgevulde vraag naar de AI sturen.

**Zo werk je ermee:**
- Per actieve stap biedt het paneel 1–2 **snelacties**, o.a.: *"Stel een samenvoegrecept
  voor"* (stap 1/3), *"Wat valt op in deze data?"* (stap 2), *"Beoordeel de dataset"* (stap
  3), *"Stel een configuratie voor"* (stap 4), *"Beoordeel de laatste fit"* (stap 5/6).
- **Geef de AI proactief je zakelijke context** (branche, seizoensdrukte, campagnes,
  offline kanalen, experimenten). Hij vraagt er zelf ook actief naar, legt de feiten vast
  (via een interne "context vastleggen"-actie) en vertaalt ze naar concrete instellingen:
  offline kanaal → `delayed` adstock + hogere `l_max`; gemeten experiment → kalibratie
  (`roas` + `sd`); sterk seizoen → seizoen aan. Dit is de hoogste hefboom die een Bayesiaans
  model heeft — hoe meer echte context, hoe beter het model.
- Een voorstel verschijnt als chatbericht met een knop **"overnemen in de editor/tabel"**.
  Na overnemen toont de editor een eenregelige samenvatting van wat er veranderde (bijv.
  "3 kolomrollen aangepast, +1 afgeleide variabele"). **Controleer dat altijd** voordat je
  samenvoegt of fit.

### 5.3 De verkennende AI-lagen (nieuw/uitgebreid)

Naast de chat zijn er vier lagen die Claude gerichter op de data zetten. Ze zijn in de
betreffende stappen al beschreven; hier het geheel op een rij:

1. **Automatische kolom-classificatie (stap 1)** — draait ongevraagd bij elke upload, geeft de
   AI een betrouwbaar startpunt voor de rol-mapping.
2. **Diepe data-inspectie (stap 3, knop)** — Claude verkent de volledige data met echte code in
   een afgeschermde sandbox en levert gestructureerde bevindingen die de AI meeleest.
3. **Agentic auto-verfijn (stap 3)** — de AI draait de triviale samenvoeg-correctielus
   zelf, tot het kwaliteitsrapport schoon is; jij keurt het eindresultaat goed.
4. **Prior-predictive check (stap 4)** — een goedkope controle of je priors realistische KPI's
   impliceren, vóórdat er dure fit-compute wordt uitgegeven.

### 5.4 Diepgaande analyse van het resultaat (stap 6)

De knop **"Genereer diepgaande analyse"** laat Claude — in dezelfde afgeschermde, netwerkloze
code-sandbox, **uitsluitend op basis van de resultaat-JSON** (geen ruwe klantdata) — een
doorlopende Nederlandstalige interpretatie plus een vaste set extra grafieken maken (aandeel
per kanaal met onzekerheid, response-/verzadigingscurves, efficiency-frontier, en 1–2
zelfgekozen grafieken). Ideaal als kant-en-klare bijlage bij je klantpresentatie.

> **Voorwaarde voor alle AI-lagen.** Ze vereisen een geconfigureerde `ANTHROPIC_API_KEY` op de
> server. Ontbreekt die, dan geeft de betreffende actie een nette foutmelding in plaats van
> stil te falen — de rest van de app (handmatig configureren en fitten) blijft gewoon werken.
> De AI draait server-side; de sandbox-code-executie heeft geen toegang tot internet of tot je
> Storage — alleen tot de data die de app er expliciet in stopt.

---

## 6. Resultaten beoordelen: de kwaliteitscontrole en diagnostiek

Voordat je een resultaat aan een klant laat zien, moet je het **vertrouwen**. De app helpt
je daarbij met een automatische, auditeerbare **kwaliteitscontrole** (verdict *pass* / *warn*
/ *fail*) en een set diagnostiekcijfers.

### 6.1 De diagnostiek-getallen (en wat "goed" is)

| Getal | Wat het zegt | Vuistregel |
|---|---|---|
| **R-hat** | Zijn de schattingen stabiel/geconvergeerd? | > 1,1 = **fail**; > 1,05 = **warn**; dichter bij 1 is beter |
| **Divergenties** | Hoe vaak liep de sampler vast? | > 2% van de samples = **fail** |
| **ESS** | Effectieve steekproefgrootte | Hoger = betrouwbaarder |
| **R²** | Hoe goed volgt het model de KPI over tijd? | < 0,3 = **warn**; dichter bij 1 is beter |
| **MAPE** | Gemiddelde procentuele voorspelfout | Lager is beter |
| **Dekking (coverage)** | Viel de echte KPI zo vaak in de marge als beloofd? | Zou dicht bij 94% moeten liggen |
| **Decompositie-check** | Tellen alle bijdragen exact op tot het totaal? | Moet kloppen |

De kwaliteitscontrole-banner vat dit in **gewone taal** samen en verschijnt alleen als er iets
aan de hand is. Groen/stil betekent: je mag dit resultaat vertrouwen.

### 6.2 Wat te doen bij warn/fail (diagnose → actie)

Vraag de AI om te helpen, maar ken de vuistregels zelf:

- **Slechte convergentie (R-hat hoog, veel divergenties):** het model is te complex voor
  deze data. **Vereenvoudig** — minder Fourier-modes, trend op `linear` of uit, een zwak
  kanaal weglaten. Of draai grondiger (hogere preset / meer tune).
- **Fit mislukt vóór het samplen (datafout):** lees de foutmelding letterlijk. "Geen
  overlappende periode" → welke bron kort het venster in? "Control bevat NaN" → geef de
  control een fill-strategie of laat 'm weg. Corrigeer in stap 3 of 4 en draai opnieuw.
- **Een kanaal krijgt een onwaarschijnlijk hoog aandeel/ROAS:** mogelijk confounding of een
  ontbrekende verklarende variabele. Voeg een control toe, of — als er een experiment is —
  kalibreer dat kanaal (§4.4).
- **Lage dekking / losse uitschieterweken sleuren het model mee:** overweeg `student_t` of
  een event-dummy voor die specifieke week.

**Gouden regel:** herhaal nooit klakkeloos een config die net faalde of "warn" gaf —
verander gericht wat de diagnose aanwijst, en noteer wat je veranderde en waarom. Gebruik de
run-historie om te bevestigen dat je iteratie het écht beter maakte.

---

## 7. Publiceren en presenteren aan de klant

### 7.1 Publiceren

Publiceren is een **expliciete, aparte actie per run** — niet automatisch na een geslaagde
fit. Kies (eventueel na het vergelijken van meerdere runs in de historie) welke run "de"
gepubliceerde wordt en klik publiceren. Dat maakt het project pas zichtbaar in het
klantdashboard. Een latere, betere run kun je op elk moment publiceren; die vervangt dan de
oude.

> **Draai je definitieve run bij voorkeur op de "Grondig"-preset** (§4), zodat de
> onzekerheidsmarges die de klant ziet zo scherp mogelijk zijn.

### 7.2 Het klantdashboard

De klant logt in en ziet uitsluitend **`/dashboard/[projectId]`**: een read-only weergave
van het laatst gepubliceerde resultaat. Dezelfde grafieken en samenvatting als jij ziet,
maar **zonder chat, zonder ruwe data, zonder tussenresultaten** — en altijd met de vaste
toelichting dat elke waarde een **mediaan met 94% betrouwbaarheidsinterval** is. Is er nog
niets gepubliceerd, dan ziet de klant enkel een regel daarover.

### 7.3 Hoe je de resultaten presenteert

Je presentatie staat of valt met hoe je de cijfers *framet*. Aanbevolen aanpak:

1. **Begin bij de kwaliteit.** Zeg eerlijk hoe betrouwbaar het model is (R², dekking) en
   hoeveel weken data eronder liggen. Dit bouwt vertrouwen.
2. **Toon contributie vóór ROAS.** "Waar kwam de omzet vandaan" (baseline + per kanaal) is
   voor een klant intuïtiever dan een kaal ROAS-getal. Benadruk dat de baseline vaak groot
   is — dat is normaal, niet alle omzet is marketing.
3. **Behandel onzekerheid als een feature, niet een excuus.** "Google's ROAS ligt tussen
   2,1 en 4,5, meest waarschijnlijk 3,2." Een breed interval betekent: hier hebben we meer
   data of een experiment nodig. Dat is een *aanbeveling*, geen zwakte.
4. **Maak het actionabel met de response curves en budgetadvies.** Laat zien waar de vólgende
   euro nog loont (marginale ROAS) en waar het rendement afvlakt (saturatie). Het
   budgetherverdelingsadvies en de efficiency-frontier zijn hiervoor gemaakt.
5. **Wees expliciet over extrapolatie.** Budgetadvies ver buiten historisch geteste spend is
   in de grafieken gemarkeerd; presenteer dat als "richting", niet als garantie.
6. **Sluit af met de vervolgstap.** MMM is iteratief: stel een experiment voor om het
   zwakst-geschatte kanaal te kalibreren, of een nieuwe fit over een paar maanden met verse
   data.

Gebruik de **"diepgaande analyse"** (§Stap 6) als geschreven bijlage: het levert een
lopend Nederlandstalig verhaal plus extra grafieken die je 1-op-1 in een rapport kunt
plakken.

---

## 8. Iteratie & veelvoorkomende problemen

| Symptoom | Waarschijnlijke oorzaak | Wat te doen |
|---|---|---|
| "Geen overlappende periode" bij samenvoegen | Eén bron heeft een veel korter datumbereik | Stap 3: check per bron het datumbereik; laat een te korte, niet-essentiële bron weg of verruim het bestand |
| Datakwaliteitsmeter "zwak" | Te weinig weken of veel ontbrekende waarden | Meer historie verzamelen; controls een fill-strategie geven; verwachtingen bijstellen |
| Twee kanalen bijna identiek (waarschuwing in rapport) | Multicollineariteit — spend loopt gelijk op | Eén kanaal weglaten of combineren tot één; benoem dit ook naar de klant |
| Fit "fail" op R-hat/divergenties | Model te complex voor de data | Vereenvoudig (minder modes, linear trend, kanaal weg) of grondiger samplen |
| Kanaal met onwaarschijnlijke ROAS | Confounding / ontbrekende control | Control toevoegen of kanaal kalibreren met een experiment |
| KPI is een lage telling (leads) | Verkeerd ruismodel | Likelihood op `poisson`/`negative_binomial` |
| Sterke jaarlijkse piek verstoort schatting | Seizoen/kalender-effect niet gemodelleerd | Seizoen aanzetten of een `recurring_week_dummy`/event-dummy toevoegen |
| AI-chat geeft een foutmelding | `ANTHROPIC_API_KEY` niet geconfigureerd | Vraag de beheerder de sleutel te zetten; werk intussen handmatig door |
| Klant ziet niets op het dashboard | Nog niets gepubliceerd, of geen `project_access` | Publiceer een run (§7.1); laat de beheerder de klant aan het project koppelen |

**Iteratiediscipline:** verander per ronde één ding tegelijk, houd de run-historie bij, en
publiceer pas de run die je écht vertrouwt.

---

## 9. Naslag: begrippenlijst

Deze definities staan ook als hover-tooltips in de resultatenweergave van de app.

- **ROAS** — Return on ad spend: hoeveel KPI (bv. omzet) elke geïnvesteerde euro in dit
  kanaal naar schatting opleverde.
- **Marginale ROAS (mROAS)** — wat de *volgende* euro in dit kanaal oplevert (de helling van
  de response curve op je huidige spend). Beslissender voor budgetkeuzes dan de gemiddelde
  ROAS.
- **Adstock (carry-over)** — het effect van marketing houdt na de uitgave nog een tijd aan;
  de **half-life** is hoe lang tot de helft van dat effect is weggeëbd.
- **Saturatie (verzadigingspunt)** — vanaf hier levert extra spend in dit kanaal steeds
  minder op (afnemend rendement).
- **Baseline** — de KPI die je zou halen zónder marketing (intercept + trend + seizoen +
  controls).
- **Contributie** — het deel van de KPI dat aan een kanaal (of aan de baseline) wordt
  toegeschreven.
- **Response curve** — voorspelde contributie bij oplopende wekelijkse spend.
- **Efficiency-frontier** — hoe de totale opbrengst verandert als je het totale budget van
  0,5× tot 2× schaalt; laat zien waar extra budget nog loont.
- **Prior** — voorkennis die je het Bayesiaanse model meegeeft; de data past die aan.
- **Credible interval (94%)** — de bandbreedte waarin de echte waarde met 94% waarschijnlijk-
  heid ligt, getoond als `(p3, p50, p97)`.
- **R²** — verklaarde variantie: hoe goed het model de KPI over tijd volgt (dichter bij 1 is
  beter).
- **MAPE** — gemiddelde procentuele afwijking tussen voorspelling en werkelijke KPI.
- **Dekking (coverage)** — hoe vaak de echte KPI binnen de opgegeven marge viel; zou dicht bij
  het percentage moeten liggen.
- **R-hat** — controlegetal voor stabiliteit van de schatting; boven 1,05 is een teken dat de
  uitkomst nog niet betrouwbaar is.
- **Divergenties** — het aantal keer dat de schattingsmethode vastliep; een hoog aantal =
  voorzichtig lezen.
- **Likelihood** — het ruismodel op de KPI: `normal`, `student_t`, `poisson` of
  `negative_binomial`.
- **Kalibratie** — een gemeten experiment-ROAS die je het model zacht laat volgen.

---

## 10. Snelchecklist per traject

**Voorbereiding**
- [ ] Wekelijkse data verzameld: KPI, spend per kanaal, eventuele controls
- [ ] Minstens ~52 weken historie (of verwachtingen bijgesteld bij minder)
- [ ] Zakelijke context uitgevraagd: branche, seizoen, campagnes, offline kanalen, experimenten
- [ ] Verwachtingen met de klant gezet (richting + onzekerheid, geen exacte euro's)

**In de app**
- [ ] Project aangemaakt (naam + klantnaam)
- [ ] Stap 1: alle bronnen geüpload (kolom-classificatie + profiel draaien automatisch)
- [ ] Stap 2: EDA bekeken; gecorreleerde spend-kanalen genoteerd
- [ ] Stap 3: samengevoegd, kwaliteitsrapport gelezen, dataset **goedgekeurd**
      (bij twijfelachtige data: **diepe data-inspectie** gedraaid; eventueel **auto-verfijn**)
- [ ] Stap 4: KPI, kanaaltypes, adstock/saturatie, likelihood, trend/seizoen gezet;
      zakelijke context via de AI verwerkt; preset gekozen; extra
      betrouwbaarheidschecks overwogen; bij aangepaste priors een **prior-predictive check**
- [ ] Stap 5: fit gedraaid en gevolgd
- [ ] Stap 6: kwaliteitscontrole = pass (of bewust geaccepteerde warn), diagnostiek gecheckt

**Afronden**
- [ ] Definitieve run op "Grondig"-preset
- [ ] (Optioneel) diepgaande analyse gegenereerd voor het rapport
- [ ] Beste run **gepubliceerd**
- [ ] Klant gekoppeld aan het project (via beheerder)
- [ ] Resultaten gepresenteerd: kwaliteit → contributie → onzekerheid → budgetadvies → vervolgstap
