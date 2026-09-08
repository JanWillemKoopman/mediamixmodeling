# Plan — nieuwe one-page website

> **Status:** Fase 1 (plan). Nog geen code geschreven, geen componenten gebouwd, de bestaande
> one-page (`app/page.tsx`) is ongewijzigd. Dit document is de bron voor Fase 2.
>
> De bestaande marketingpagina is voor dit plan expliciet **niet** als uitgangspunt gebruikt.
> De codebase is alleen gelezen om de stack, routes, auth-flow en herbruikbare infrastructuur
> te begrijpen (zie §23 en §26).

---

## 1. Doel van de website

Eén pagina die een marketingverantwoordelijke met een substantieel mediabudget binnen enkele
seconden laat begrijpen:

1. dat hij wel weet **hoeveel** hij aan media uitgeeft, maar niet zeker weet **wat het oplevert**;
2. dat dat verschil een concreet management- en budgetprobleem is;
3. dat dit inzichtelijk te maken is;
4. dat dat inzicht leidt tot een **betere budgetbeslissing**;
5. wat de eerstvolgende, laagdrempelige stap is.

Het commerciële product van deze pagina is **inzicht**, niet software. De pagina verkoopt geen
tool, geen dashboard en geen methode. Media Mix Modeling is de *methode achter* het inzicht en
komt daarom pas laat, klein en feitelijk in beeld.

**Meetbaar doel:** een gekwalificeerde aanvraag ("ontdek het effect van je mediabudget") van
iemand die verantwoordelijk is voor het mediabudget. Secundair: begrip opbouwen via de
voorbeeldanalyse, zodat het gesprek al inhoudelijk begint.

**Niet-doelen:** zelfbediening/aanmelden, productdocumentatie, uitleg van de modeltechniek,
demo van de applicatie-UI, werving van data-analisten.

---

## 2. Doelgroep

**Primair — de budgethouder.** CMO, marketingdirecteur, marketing manager bij een middelgroot
bedrijf met meerdere actieve mediakanalen en een substantieel jaarlijks mediabudget. Werkt met
een mediabureau en/of een intern team, heeft GA4, platformrapportages en dashboards, kent ROAS
en CPA. Is niet datawetenschappelijk geschoold en hoeft dat ook niet te zijn.

**Situatie:** er is geen datatekort — er is een *duidingstekort*. Elk kanaal rapporteert zijn
eigen succes; de optelsom klopt niet met de omzet; de vraag "wat gebeurt er als we verschuiven?"
blijft onbeantwoord. Deze vraag komt meestal van boven (directie, CFO, board) en moet naar
beneden worden onderbouwd.

**Secundair — de beoordelaar.** Head of Performance / marketing analyst / data lead die de
aanpak inhoudelijk toetst voordat de budgethouder verder wil. Hij zoekt naar signalen van
methodische serieusheid: onzekerheidsmarges, tijdreeks over meerdere jaren, externe factoren,
geen overclaims. Voor hem staat er per sectie precies één feitelijke, verifieerbare laag —
zichtbaar genoeg om vertrouwen te wekken, klein genoeg om de hoofdroute niet te vertroebelen.

**Tertiair — de interne pleitbezorger** die dit intern moet verkopen. Hij heeft één zin nodig
die hij in een directieoverleg kan herhalen. Die zin is de H1.

---

## 3. Positionering

**Kernpositionering (strategische bron voor alle copy):**

> Je weet hoeveel je aan media uitgeeft. Wij helpen je begrijpen wat het oplevert — zodat je
> beter kunt beslissen waar je budget naartoe gaat.

**Tweede formulering (gebruikt in sectie 05):**

> Maak het effect van je mediabudget zichtbaar en gebruik dat inzicht om betere
> budgetbeslissingen te nemen.

**Categorie waarin we willen landen:** *besluitvormingsondersteuning voor mediabudget* —
niet "MMM-tool", niet "analytics platform", niet "marketingbureau".

**Wat we niet zijn (en wat de pagina dus nergens mag suggereren):**

| Niet | Waarom niet |
| --- | --- |
| MMM-tool | Verplaatst het gesprek naar techniek en vergelijkbare tools |
| Dashboard | Suggereert meer rapportage — precies het probleem dat de klant al heeft |
| AI-product | Devalueert de statistische onderbouwing en trekt de verkeerde aandacht |
| Attributiemodel | Ander vraagstuk, andere belofte, andere claims |
| Consultancy zonder methode | Verliest het onderscheidend vermogen |

**Onderscheidend vermogen (wat we wél claimen):** de uitkomst is een **onderbouwde
budgetbeslissing met een expliciete onzekerheidsmarge**, niet een cijfer met schijnzekerheid.
Eerlijkheid over onzekerheid is het merkkenmerk, niet een disclaimer.

---

## 4. Messaging hierarchy

De strategische volgorde WAAROM → WAT → WAARDE → HOE is één-op-één vertaald naar de
paginavolgorde:

```
WAAROM    Ik wil weten wat mijn mediabudget bijdraagt.        → sectie 01–03
WAT       Jullie maken het effect van mijn media zichtbaar.   → sectie 04–05
WAARDE    Ik kan mijn budget beter beoordelen en verdelen.    → sectie 06–07
HOE       Jullie gebruiken Media Mix Modeling.                → sectie 08 (klein)
BEWIJS    Dit is geloofwaardig.                               → sectie 09
ACTIE     Dit is mijn volgende stap.                          → sectie 10
```

**Messagingregel voor elke sectie** (verplicht bij het schrijven van copy):

```
Wat we meten  →  Wat je daardoor begrijpt  →  Welke beslissing je ermee kunt nemen
```

Voorbeeld van de regel in de praktijk:

- ❌ "We analyseren mediabestedingen per kanaal."
- ✅ "We brengen de geschatte bijdrage van je mediakanalen aan je resultaat in kaart. Daarmee
  krijg je meer houvast bij de verdeling van je mediabudget."

**Woordenlijst — verboden:** unlock, revolutionize, next-generation, cutting-edge,
game-changing, AI-powered, future of marketing, maximize ROI, transformative, disruptive,
"maximaliseer", "ontgrendel", "haal alles uit", "in één oogopslag", "single source of truth".

**Woordenlijst — verboden op de hoofdroute** (mag hooguit in een kleine methodische voetnoot in
sectie 08/09): Bayesiaans, MCMC, posterior, adstock, saturatie, regressie, modelarchitectuur,
pipeline, machine learning, algoritme, API.

**Woordenlijst — gewenst:** geschatte bijdrage, media-effect, houvast, onderbouwen, verdelen,
verschuiven, scenario, bandbreedte, onzekerheidsmarge, mediaplan, directie, resultaat.

**Claimregels (hard):** geen causale zekerheid, geen gegarandeerde uplift, geen percentages die
niet uit een echte analyse komen. Alles wat een schatting is, heet een schatting. Elk getal op
de pagina is óf (a) een feit over de werkwijze, óf (b) zichtbaar gelabeld als **voorbeelddata**.
Er komen geen verzonnen klantcijfers, geen verzonnen logo's en geen verzonnen quotes op de
pagina — plekken daarvoor blijven leeg tot er echt materiaal is (zie §24, risico R4).

---

## 5. Informatiearchitectuur

Eén doorlopende pagina, geen tabs, geen accordeon-navigatie op hoofdniveau. De IA is een
**argumentatielijn**, geen menu:

```
spanning opbouwen ──────────────► spanning benoemen ──────► spanning oplossen ──────► handelen
   01 hero          02 probleem       03 de vraag           04 waarom niet       05 inzicht
                                                            06 vragen  07 beslissing  08 hoe
                                                                                 09 bewijs
                                                                                 10 actie
```

- **Header:** minimaal en sticky-light (verschijnt pas na de hero uit beeld is). Bevat
  wordmark, twee ankers ("De vraag", "Aanpak"), tekstlink **Inloggen** en de primaire CTA.
  De loginroute blijft daarmee bereikbaar zonder de commerciële route te verstoren.
- **Ankers:** `#de-vraag`, `#voorbeeldanalyse`, `#aanpak`, `#contact`. Alleen deze vier zijn
  publiek adresseerbaar; de rest is verhaal, geen bestemming.
- **Diepte:** de pagina heeft precies één laag progressive disclosure — de management­vragen in
  sectie 06 (native `<details>`), zodat de pagina kort blijft voor wie scant en volledig voor
  wie leest.
- **Footer:** contact, e-mail, inloglink, KvK/juridisch (indien van toepassing), niets meer.

---

## 6. Voorgestelde secties, 7. volgorde, 8. doel, 9. kernboodschap, 10. headline-richting

Tien secties. Elke sectie heeft één functie in het commerciële verhaal; secties zonder functie
bestaan niet. Headlines hieronder zijn *richting* — de definitieve copy wordt in Fase 2
geschreven binnen deze kaders.

### 01 — Hero
- **Doel:** in vijf seconden de spanning openen en positioneren op *beslissing*, niet op tool.
- **Kernboodschap:** je weet wat je uitgeeft; je weet niet wat het doet.
- **Headline (H1):** *Weet wat je mediabudget doet.*
- **Ondersteunend:** "Je weet hoeveel je uitgeeft en wat je advertentieplatforms rapporteren.
  Maar weet je ook welk effect je mediabestedingen daadwerkelijk hebben op je resultaat?"
- **CTA primair:** Ontdek het effect van je mediabudget · **secundair:** Bekijk een voorbeeldanalyse
- **Visueel:** geen productscreenshot, geen stockbeeld. De hero toont de **spend-balk** — de
  eerste helft van de centrale metafoor (§13): één horizontale balk, verdeeld in segmenten naar
  mediabudget per kanaal. Rustig, groot, typografisch gedragen. Onder de balk staat één regel:
  "Dit is waar je geld staat." De tweede balk komt pas in sectie 05 — de pagina houdt hier
  bewust iets achter.

### 02 — Herkenbaar probleem
- **Doel:** herkenning; de bezoeker moet zijn eigen maandagochtend zien.
- **Kernboodschap:** je hebt marketingdata genoeg — data alleen vertelt nog niet wat je
  mediabudget heeft bijgedragen.
- **Headline (H2):** *Geen gebrek aan cijfers. Wel aan een totaalbeeld.*
- **Copy-richting:** korte, feitelijke opsomming in lopende tekst: elk kanaal rapporteert zijn
  eigen resultaat, elk dashboard heeft zijn eigen waarheid, de optelsom van kanaalconversies
  komt niet overeen met wat het bedrijf verdient.
- **Visueel:** een veld van kleine, fragmentarische cijferfragmenten (kanaalnamen, CPA's, ROAS-en,
  conversieaantallen) in gedempt grijs, licht overlappend en onvolledig uitgelijnd — een
  *rommelig gevoel*, niet een rommelig ontwerp. Zichtbaar geen totaal. Gelabeld als
  voorbeeldweergave.

### 03 — De managementvraag
- **Doel:** het probleem tot één zin aanscherpen. Visueel hoogtepunt #1.
- **Kernboodschap:** dit is de vraag waar het management daadwerkelijk op stuurt.
- **Headline (H2, full-bleed, donker vlak, zeer groot):**
  *Wat gebeurt er met je resultaat als je je mediabudget verandert?*
- **Copy-richting:** maximaal twee zinnen eronder. "Die vraag komt zelden uit een rapportage.
  Hij komt uit de directiekamer."
- **Interactie:** één schuifregelaar die budget verschuift tussen twee kanalen; het geschatte
  resultaat verschijnt als **bandbreedte**, niet als getal met schijnprecisie. Expliciet gelabeld
  als illustratie op voorbeelddata. Dit is de eerste keer dat de bezoeker voelt dat er een
  antwoord *bestaat*, zonder dat er iets is beloofd.
- **Anker:** `#de-vraag`.

### 04 — Waarom rapportages niet voldoen
- **Doel:** verklaren waarom bestaande cijfers de vraag uit 03 niet beantwoorden — zonder
  platformen of bureaus aan te vallen.
- **Kernboodschap:** *rapporteren is iets anders dan verklaren.*
- **Headline (H2):** *Rapporteren is iets anders dan verklaren.*
- **Copy-richting:** platformrapportages doen precies waarvoor ze gemaakt zijn: registreren wat
  er binnen hun eigen omgeving gebeurt. Ze zijn nuttig en blijven nuttig. Maar ze kunnen niet
  zien wat er buiten hun omgeving gebeurt, en ze kennen elkaar niet. De vraag van het management
  gaat over het *totale* resultaat.
- **Visueel:** de som van door platformen gerapporteerde conversies naast het werkelijke
  bedrijfsresultaat — de optelsom overschrijdt het totaal zichtbaar. Eén boodschap, geen legenda
  vol metrics. Gelabeld als voorbeeldweergave.
- **Toon:** respectvol en volwassen. Geen vijandbeeld.

### 05 — Het inzicht
- **Doel:** de oplossing introduceren als *inzicht*, en de metafoor voltooien. Visueel
  hoogtepunt #2.
- **Kernboodschap:** het effect van je mediabudget is te schatten, en dat verandert het gesprek.
- **Headline (H2):** *Maak het effect van je mediabudget zichtbaar.*
- **Visueel (kern van de pagina):** de spend-balk uit de hero keert terug en **transformeert**
  naar een tweede balk: de geschatte bijdrage. De segmenten houden hun kleur en volgorde, maar
  veranderen van breedte. Het verschil tussen de twee balken ís het argument: *waar je geld staat*
  versus *waar het effect lijkt te zitten*.
- **Copy-richting:** we brengen mediabestedingen, bedrijfsresultaat en andere relevante factoren
  (prijs, promoties, seizoen, marktomstandigheden) over meerdere jaren met elkaar in verband.
- **Introductie van de methode — klein, feitelijk, ondergeschikt:** "We gebruiken Media Mix
  Modeling om de relatie tussen mediabestedingen, bedrijfsresultaat en andere relevante factoren
  te analyseren." Dit is de eerste vermelding van MMM op de hele pagina. Zetting: kleiner dan de
  body, als methodische noot — nooit als headline.
- **Anker:** `#voorbeeldanalyse` (doel van de secundaire CTA).

### 06 — Welke vragen kun je beantwoorden?
- **Doel:** de waarde concreet maken in de taal van de bezoeker.
- **Kernboodschap:** dit zijn de vragen waar je daarna antwoord op hebt.
- **Headline (H2):** *Vragen waar je daarna een onderbouwd antwoord op hebt.*
- **Vorm:** géén featurelijst en géén cards. Een editoriale lijst van vijf managementvragen in
  groot type, elk met één regel antwoordrichting die openklapt (`<details>`):
  1. Welke mediakanalen dragen naar schatting bij aan ons resultaat?
  2. Waar zit ruimte om budget anders te verdelen?
  3. Wat kan er gebeuren als we onze budgetverdeling veranderen?
  4. Hoe verhouden onze kanalen zich tot elkaar?
  5. Hoe onderbouw ik mijn mediaplan richting directie?
- **Regel:** elk antwoord eindigt bij een *beslissing*, niet bij een cijfer.

### 07 — Van inzicht naar beslissing
- **Doel:** de commerciële waarde maximaliseren; inzicht koppelen aan handelen.
- **Kernboodschap:** *inzicht is pas waardevol wanneer het leidt tot een betere beslissing.*
- **Headline (H2):** *Inzicht is pas waardevol als het tot een betere beslissing leidt.*
- **Vorm:** vijf stappen als horizontaal ritme (desktop) / verticale tijdlijn (mobiel), in
  typografie, niet in vijf gelijke boxes:
  METEN (wat hebben we geïnvesteerd?) → BEGRIJPEN (wat lijkt het effect te zijn?) →
  VERGELIJKEN (hoe verhouden kanalen en scenario's zich?) → BESLISSEN (waar zetten we budget in?)
  → BIJSTUREN (wat betekent dit voor het volgende mediaplan?)

### 08 — Hoe het werkt
- **Doel:** onzekerheid en complexiteit wegnemen; laten zien dat dit behapbaar is.
- **Kernboodschap:** vier stappen, jij hoeft geen expert te zijn.
- **Headline (H2):** *Vier stappen, van je eigen cijfers naar een onderbouwde keuze.*
- **Stappen:** 1. Data (je mediabestedingen, resultaten en relevante factoren) · 2. Analyse (de
  onderliggende relaties worden geanalyseerd) · 3. Inzicht (de geschatte bijdrage van media wordt
  zichtbaar, mét bandbreedte) · 4. Beslissing (de inzichten ondersteunen je budgetkeuzes).
- **Methodische noot (klein):** "Media Mix Modeling is de methode achter de analyse."
- **Anker:** `#aanpak`.

### 09 — Vertrouwen
- **Doel:** geloofwaardigheid, zonder social-proof-opvulling.
- **Kernboodschap:** dit is zorgvuldig werk, en we zijn eerlijk over wat we niet weten.
- **Headline (H2):** *Een schatting met een eerlijke marge is meer waard dan een cijfer met valse
  precisie.*
- **Inhoud — uitsluitend verifieerbare uitspraken over de werkwijze:**
  - de analyse gebruikt wekelijkse data over meerdere jaren;
  - naast media worden prijs, promoties, seizoen en externe omstandigheden meegenomen;
  - elk resultaat komt met een expliciete bandbreedte (onzekerheidsmarge), altijd zichtbaar;
  - een mens beoordeelt elke stap; niets wordt automatisch gepubliceerd;
  - de uitkomst is een afgeschermde, gepubliceerde analyse voor jouw organisatie.
- **Ruimte gereserveerd (leeg tot er echt materiaal is):** klantcase, quote, genomen besluit,
  klantlogo's. **Niet invullen met fictie.** Als er bij oplevering niets is, wordt deze
  subsectie weggelaten in plaats van gevuld.

### 10 — Call to action
- **Doel:** laagdrempelige conversie.
- **Headline (H2):** *Begin bij één vraag: wat doet ons mediabudget?*
- **Vlak voor de CTA staat expliciet:** voor wie dit relevant is (verantwoordelijk voor een
  substantieel mediabudget over meerdere kanalen, met minimaal ~2 jaar wekelijkse historie), wat
  je krijgt (een analyse van de geschatte bijdrage van je kanalen, met bandbreedte, en een
  gesprek over wat dat voor je budgetverdeling betekent), dat je geen MMM-expert hoeft te zijn,
  en dat het draait om betere beslissingen.
- **Primair:** Ontdek het effect van je mediabudget · **Secundair:** Bekijk een voorbeeldanalyse
- **Anker:** `#contact`.

---

## 11. CTA-strategie

| | Label | Gedrag | Waarom |
| --- | --- | --- | --- |
| Primair | **Ontdek het effect van je mediabudget** | Opent een voorbereid e-mailbericht aan het contactadres (onderwerp + korte, ingevulde structuur: kanalen, budget-orde, beschikbare historie) | Verkoopt de uitkomst, niet de software; nul extra infrastructuur; werkt zonder JavaScript; past bij een B2B-traject waar het eerste contact tóch een gesprek is |
| Secundair | **Bekijk een voorbeeldanalyse** | Ankert naar `#voorbeeldanalyse` (sectie 05) | Geen registratie, geen drempel, geen loze belofte; de "demo" staat ín de pagina |
| Tertiair | **Inloggen** | `/login` | Bestaande applicatiefunctie blijft bereikbaar, maar tekstlink in header/footer — nooit als knop naast de primaire CTA |

**Regels:** de primaire CTA komt drie keer voor (header na scroll, hero, slotsectie) en nergens
anders. Nooit "Start demo", "Create account", "Build model", "Start MMM". De secundaire CTA
belooft nooit meer dan de pagina waarmaakt.

**Openstaand besluit (D1, zie §26):** mailto versus een klein contactformulier. Mailto is het
voorstel voor Fase 2 (geen backend, geen persoonsgegevensopslag, geen spamoppervlak). Een
formulier vraagt om een API-route + tabel + RLS + spambescherming en is als losse vervolgstap
beter te doen dan verstopt in deze opdracht.

**Openstaand besluit (D2):** het contactadres. Het huidige adres in de code is een persoonlijk
gmail-adres; voor de gewenste merkperceptie is een zakelijk domeinadres sterker. Dit is een
keuze van de opdrachtgever, geen ontwerpkeuze.

---

## 12. Visueel concept

**Concept: "Twee balken."**

De hele pagina draait om één beeld dat langzaam compleet wordt: een balk die laat zien *waar je
geld staat*, en een tweede balk die laat zien *waar het effect lijkt te zitten*. Het verschil
tussen die twee is de reden van bestaan van dit bedrijf. Alles op de pagina — kleur, ritme,
animatie — dient dat ene beeld.

**Karakter:** editorial-zakelijk. Grote, rustige typografie op ruime vlakken; weinig lijnen,
weinig randen, vrijwel geen iconen; contrast wordt gemaakt met *ruimte en schaal*, niet met
boxen en schaduwen. De pagina moet aanvoelen als een goed vormgegeven strategisch document dat
toevallig interactief is — niet als een productpagina.

**Ritme:** de pagina ademt in drie registers, die elkaar afwisselen zodat de bezoeker nooit door
een uniforme kolom scrollt:
1. **licht editorial** (warme off-white, tekst links uitgelijnd, veel wit) — 02, 06, 08;
2. **donker statement** (diep inktvlak, gecentreerd, zeer groot type) — 03, en het slotvlak 10;
3. **data-vlak** (licht, maar met de balkvisualisatie als hoofdelement) — 01, 04, 05, 07, 09.

**Beeld** (toegevoegd na de eerste oplevering): het beeldmateriaal is de data zelf — 209 weken
mediabestedingen en omzet, als donkere band boven de managementvraag en als strip in de
voorbeeldcase — plus een korrellaag op de inktvlakken. Fotografie blijft optioneel op twee
plekken, in één gedeelde duotone-grading. Zie `docs/one-page-website-beeld.md`.

**Wat we bewust níét doen:** hero met screenshot, drie feature cards, logostrip, icoongrid,
pricing, FAQ-accordeon, standaard CTA-banner, glasmorphism, gradient-blobs, "AI-glow",
dashboard-mock als held.

---

## 13. Visuele metafoor

**Van mediabudget naar media-effect.**

```
€ mediabudget            geschatte bijdrage
┌──────┬─────┬────┬───┐  ┌───┬────────┬──┬─────┐
│Search│Socl │Vid │TV │  │Sr │ Social │V │ TV  │
└──────┴─────┴────┴───┘  └───┴────────┴──┴─────┘
     waar je geld staat        waar het effect lijkt te zitten
                    ▲
              hier zit het gesprek
```

**Opbouw over de pagina (de bezoeker bouwt het beeld zelf op):**

1. **01 Hero** — alleen de spend-balk. "Dit is waar je geld staat."
2. **02** — het beeld valt uiteen in losse, onverbonden fragmenten: veel cijfers, geen totaal.
3. **03** — één vraag boven een lege plek waar het antwoord zou moeten staan; de schuifregelaar
   laat een bandbreedte oplichten.
4. **04** — de gerapporteerde optelsom steekt zichtbaar uit boven het werkelijke totaal.
5. **05** — de spend-balk keert terug en transformeert naar de effect-balk. Het verschil wordt
   met één dunne verbindingslijn per kanaal zichtbaar gemaakt.
6. **07** — dezelfde balk, nu in twee scenario's naast elkaar: huidige verdeling versus
   verschoven verdeling, met de bandbreedte van het verschil.
7. **10** — de balk verdwijnt; alleen de beslissing blijft staan.

**Regels:** dezelfde kanaalvolgorde en dezelfde kleurtoewijzing overal op de pagina. Nooit meer
dan zes kanalen tegelijk. Elke verschijning van het beeld draagt exact één boodschap.

---

## 14. Kleurstrategie

De applicatie draagt de huisstijl van de organisatie (donkerblauw `#19243B` als inktkleur,
helderblauw als actiekleur, warme zand-neutralen, oranje accent — vastgelegd in
`tailwind.config.ts`). De marketingpagina blijft **familie** van die huisstijl, maar krijgt een
eigen, rustiger en donkerder register dat past bij een strategisch document. Concreet:

| Rol | Waarde (richting) | Gebruik |
| --- | --- | --- |
| Inkt / diep vlak | `#12192A`–`#19243B` (huisstijl-donkerblauw, iets dieper) | statement-secties 03/10, hero-typografie |
| Canvas licht | `#FBFAF7` warm off-white | editoriale secties |
| Canvas subtiel | `#F2EFE9` zand | afwisselingsvlakken, tabel-/balkachtergrond |
| Tekst | inkt op licht, off-white op donker | body ≥ 4.5:1, groot display ≥ 3:1 (praktisch: alles ≥ 4.5:1) |
| **Signaalkleur — effect** | helder blauw uit de huisstijl (`#003DA5`), spaarzaam | uitsluitend voor *media-effect* en primaire CTA |
| Neutraal — spend | grijs-zand schaal | uitsluitend voor *bestedingen* |
| Accent — attentie | oranje uit de huisstijl (`#ED6935`), zeer spaarzaam | maximaal twee keer op de hele pagina (de "kloof" in 05, het verschil in 07) |

**De kleurregel die het hele verhaal draagt:** *spend is neutraal, effect is blauw.* De bezoeker
leert die code binnen twee secties en begrijpt daarna elke visualisatie zonder legenda.

**Kanaalkleuren in de balken:** één sequentiële schaal binnen de blauw/zand-familie (donker →
licht), geen zes verschillende hues. Kanalen worden onderscheiden door positie, volgorde en
label — niet door een regenboog. Onderscheid moet ook in grijswaarden en bij kleurenblindheid
overeind blijven; segmenten krijgen daarom altijd tekstlabels, niet alleen kleur.

**Technisch:** de nieuwe waarden worden als een **aparte `site`-tokenset** toegevoegd
(`colors.site.*` + CSS-variabelen op de paginawrapper). De bestaande app-tokens (`bg`,
`surface`, `accent`, `brand`, …) worden **niet** gewijzigd, zodat de wizard en het
klantdashboard exact blijven zoals ze zijn.

---

## 15. Typografie

Maximaal twee fonts, beide self-hosted via `next/font` (geen runtime-CDN, consistent met de
huidige aanpak).

- **Display (nieuw):** een editoriale, licht contrastrijke serif voor H1, de management­vraag en
  de sectiekoppen. Dit is de belangrijkste bron van eigen identiteit en het duidelijkste
  onderscheid met generieke SaaS-pagina's (die vrijwel altijd volledig grotesk zijn).
  Voorstel: `Instrument Serif` (één gewicht, latin subset, `display: swap`) — smal in payload,
  groot in karakter. Alternatief bij twijfel: `Newsreader` of `Source Serif 4`.
- **Tekst / UI / data (bestaand):** `Figtree`, al self-hosted in `app/layout.tsx`. Neutraal,
  humanistisch, uitstekend leesbaar, kost geen extra bytes. Getallen met
  `font-variant-numeric: tabular-nums` (de bestaande `.tnum`-utility).

**Schaal (fluid, `clamp()`):**

| Rol | Mobiel → desktop | Zetting |
| --- | --- | --- |
| H1 | 2.5rem → 5rem | serif, `tracking-tight`, `line-height` 1.02–1.08 |
| Statement (sectie 03) | 2.25rem → 4.5rem | serif, gecentreerd, max. 16 woorden |
| H2 | 1.75rem → 3rem | serif |
| Lead | 1.125rem → 1.375rem | sans, `line-height` 1.5 |
| Body | 1rem → 1.0625rem | sans, `line-height` 1.65, max. 62–68 tekens |
| Label / methodische noot | 0.8125rem | sans, `letter-spacing` +0.04em, hoofdletterklein |

**Regels:** tekstblokken van maximaal drie zinnen; nooit twee tekstkolommen naast elkaar op
desktop tenzij het een expliciete vergelijking is (sectie 04); geen gecentreerde lopende tekst
buiten de statement-secties.

---

## 16. Spacing

- **Basisraster:** 8px. Alle verticale afstanden zijn veelvouden (8/12/16/24/32/48/64/96/128).
- **Sectieritme:** `clamp(5rem, 12vh, 9rem)` verticale padding; statement-secties krijgen
  ~1,5× zoveel lucht als editoriale secties — de pagina moet hoorbaar stiller worden vóór de
  managementvraag.
- **Contentbreedtes:** lopende tekst max. `65ch`; editoriale secties `max-w-5xl`;
  visualisaties `max-w-6xl`; statement-secties full-bleed met binnenmarge.
- **Horizontale marge:** 20px (mobiel) → 32px (tablet) → 64px+ (desktop), met een gecentreerde
  container van maximaal 1280px.
- **Principe:** witruimte is het belangrijkste ontwerpmateriaal van deze pagina. Bij twijfel:
  meer ruimte, minder element.

---

## 17. Componentstijl

- **Geen kaarten als standaardoplossing.** Groepering gebeurt met ruimte, uitlijning en
  typografische hiërarchie. Een omkadering wordt alleen gebruikt als iets echt een afzonderlijk
  object is (de voorbeeld-analysepanelen in 05 en 07).
- **Randen:** hooguit één haarlijn (1px, ≤10% inkt) per compositie. Geen dubbele randen, geen
  schaduwstapels. Eén zachte schaduw is toegestaan op de twee data-panelen.
- **Knoppen:** primair = gevulde pil in de signaalkleur; secundair = tekstlink met onderlijn bij
  hover/focus. Geen derde knopstijl. Minimale raakvlakhoogte 44px.
- **Iconen:** vrijwel geen. `lucide-react` is beschikbaar maar wordt op deze pagina hooguit
  gebruikt voor één functioneel pijltje. Geen decoratieve icoonsets.
- **Lijsten:** editoriale nummering (01, 02, 03 …) in de sans, klein en gedempt.
- **Herbruikbaarheid:** de bestaande `components/ui.tsx` (Card, Button, PageHeader, TopBar) is
  gemaakt voor de *applicatie* en wordt op de marketingpagina **niet** gebruikt; anders erft de
  pagina onvermijdelijk de app-esthetiek. Nieuwe componenten leven in `components/site/`.

---

## 18. Data visualization approach

**Uitgangspunt:** elke visual vertelt één zin. Als er een legenda met meer dan drie items nodig
is, is het ontwerp fout.

| Sectie | Visual | De ene boodschap |
| --- | --- | --- |
| 01 | Spend-balk (gestapeld, horizontaal) | "Dit is waar je geld staat." |
| 02 | Gefragmenteerd cijferveld | "Veel cijfers, geen totaal." |
| 03 | Bandbreedte-uitkomst bij een budgetverschuiving | "Er is een antwoord, met een marge." |
| 04 | Gerapporteerde optelsom versus werkelijk totaal | "Rapportages tellen niet op tot je resultaat." |
| 05 | Spend-balk → effect-balk (transformatie) | "Waar je geld staat is niet waar het effect zit." |
| 07 | Twee scenario's naast elkaar, met verschilbandbreedte | "Een andere verdeling geeft een ander verwacht resultaat." |
| 09 | Bijdrage met zichtbaar onzekerheidsinterval | "We tonen ook wat we niet zeker weten." |

**Regels:**
- Elke visual toont een **bandbreedte** waar het om een schatting gaat. Nooit een kaal punt.
- Elke visual met cijfers draagt zichtbaar het label **"Voorbeelddata — ter illustratie"**.
- Geen assen, rasters of tooltips tenzij ze de ene boodschap dragen; geen KPI-rijen; geen
  meerdere metrics in één beeld; geen dashboardachtige compositie.
- **Techniek:** handgeschreven, toegankelijke inline **SVG/CSS**, geen `recharts` op de
  marketingpagina. Recharts blijft waar het hoort (het klantdashboard); het meeslepen ervan naar
  de landingspagina kost bundelgrootte en trekt het ontwerp automatisch richting dashboard.
- **Toegankelijkheid van visuals:** elke visual heeft `role="img"` + een `aria-label` die de
  boodschap in woorden geeft, plus — waar er cijfers zijn — een visueel verborgen tabel met
  dezelfde waarden. Kleur is nooit de enige drager van betekenis.
- **Databron:** de cijfers worden afgeleid uit de meegeleverde, synthetische demodatasets
  (`demo_data/`, wekelijkse retail-achtige reeksen) en in de code vastgelegd als expliciet
  benoemde voorbeeldwaarden in `lib/site/exampleData.ts`. Ze worden nergens als klantresultaat
  gepresenteerd.

---

## 19. Animation principles

Animatie ondersteunt het argument of ze bestaat niet.

- **Toegestaan:** (1) de balktransformatie in 05 — segmentbreedtes die over ~700ms naar hun
  nieuwe waarde bewegen wanneer de sectie in beeld komt; (2) getalovergangen die met die
  beweging meelopen; (3) gestaffelde tekstonthulling van maximaal 16px verplaatsing en 400ms;
  (4) het "tekenen" van de bandbreedte in 03/09; (5) directe, niet-vertraagde reactie op de
  schuifregelaar.
- **Verboden:** parallax, scroll-hijacking, blijvende bewegende achtergronden, elementen die
  binnenvliegen vanaf buiten beeld, tellers die bij elke scroll opnieuw beginnen, hover-effecten
  die layout verschuiven.
- **Timing:** 200–700ms, `cubic-bezier(0.22, 1, 0.36, 1)`. Nooit langer dan 700ms.
- **Eénmalig:** onthullingsanimaties spelen één keer per bezoek; terugscrollen herhaalt niets.
- **`prefers-reduced-motion: reduce`:** alle transities uit, eindtoestand direct zichtbaar; de
  schuifregelaar blijft werken (dat is interactie, geen decoratie).
- **Zonder JavaScript:** alle inhoud is standaard zichtbaar. De onthullingsstijl wordt pas
  geactiveerd wanneer JS aanwezig is (klasse op de wrapper), zodat de pagina zonder JS volledig
  leesbaar blijft in plaats van leeg.

---

## 20. Responsive behavior

Mobile-first ontworpen, niet mobile-gecomprimeerd. De verhaallijn is op een telefoon precies
even logisch, omdat ze verticaal is bedacht.

| Breekpunt | Gedrag |
| --- | --- |
| < 640px | Eén kolom. H1 op ~2.5rem, statement op ~2.25rem. Balken worden **verticaal** gestapeld (kanaal per rij) in plaats van horizontaal samengeperst — labels blijven leesbaar. Scenario-vergelijking (07) wordt boven/onder in plaats van naast elkaar. CTA volle breedte, 48px hoog. Header: wordmark + primaire CTA, ankers verborgen (geen hamburger — er zijn maar vier ankers en de pagina is één verhaal). |
| 640–1024px | Eén kolom met bredere marges; balken horizontaal met ingekorte labels; stappen (07/08) in twee rijen. |
| > 1024px | Volledige editoriale opmaak: asymmetrische uitlijning waar het iets toevoegt (kop links, visual rechts uitlopend in 04/05), statement-secties full-bleed. |
| > 1440px | Container maximaal 1280px; extra ruimte gaat naar marge, niet naar grotere tekst. |

**Harde eisen:** geen horizontale overflow op enig breekpunt (te testen op 320px); geen
tekst < 16px in interactieve elementen op touch; visuals houden hun boodschap ook op 320px; geen
`100vw`-elementen met scrollbar-artefacten.

---

## 21. Accessibility

Streefniveau **WCAG 2.1 AA**.

- Semantische structuur: één `<h1>`, daarna uitsluitend `<h2>` per sectie en `<h3>` daarbinnen —
  geen overgeslagen niveaus. `<header>`, `<main>`, `<section aria-labelledby=…>`, `<footer>`.
- Skip-link naar `#main` als eerste focusbare element.
- Volledige toetsenbordbediening; zichtbare `:focus-visible`-ring (2px, ≥3:1 contrast) op elk
  interactief element; logische tabvolgorde; geen focusvallen.
- De schuifregelaar is een echte `<input type="range">` met `aria-valuetext` in woorden
  ("60% van het budget naar Search"), bedienbaar met pijltjestoetsen; het resultaat wordt in een
  `aria-live="polite"`-gebied als zin aangekondigd (geen losse getallen).
- `<details>/<summary>` voor de management­vragen: native toegankelijk, werkt zonder JS.
- Contrast: alle tekst ≥ 4.5:1 (ook op het donkere inktvlak en op zandvlakken); balksegmenten
  onderling ≥ 3:1 of gescheiden door een lichte scheidingslijn.
- `prefers-reduced-motion` gerespecteerd (§19).
- Alle visuals hebben een tekstueel equivalent (§18); decoratieve elementen `aria-hidden`.
- Formulier/CTA-teksten zijn zelfstandig begrijpelijk ("Ontdek het effect van je mediabudget",
  niet "Lees meer").
- `lang="nl"` staat al goed in `app/layout.tsx`.

---

## 22. SEO

- **Title:** `Weet wat je mediabudget doet — inzicht in het effect van je mediabestedingen`
  (< 60 tekens waar mogelijk; commerciële boodschap gaat vóór trefwoorddichtheid).
- **Meta description:** "Je weet hoeveel je aan media uitgeeft. Wij maken het geschatte effect
  van je mediabestedingen zichtbaar, zodat je je mediabudget beter kunt verdelen en onderbouwen."
- **H1:** exact de heroheadline; **H2's:** de negen sectiekoppen — samen leesbaar als een
  inhoudsopgave van het argument.
- **Open Graph / Twitter:** titel, beschrijving, `og:type=website`, `og:locale=nl_NL` en een
  OG-afbeelding. Voorstel: genereren met `next/og` (`opengraph-image.tsx`) op basis van de
  twee-balken-metafoor — geen los ontworpen PNG die uit de pas gaat lopen.
- **Structured data (JSON-LD):** `Organization` (naam, url, logo, contactpunt) +
  `Service`/`ProfessionalService` met een neutrale, niet-claimende beschrijving. Géén
  `AggregateRating`, `Review` of `FAQPage` zolang er geen echte onderliggende inhoud is.
- **Techniek:** server-gerenderde HTML (alle copy staat in de HTML, niet in JS-payload),
  `metadataBase`, canonical, `robots` toegestaan, `sitemap.ts` en `robots.ts` als kleine
  toevoeging.
- **Trefwoordrichting (natuurlijk verwerkt, nooit geforceerd):** effect mediabudget, bijdrage
  mediakanalen, mediabudget verdelen, media mix modeling (secundair, in de methodische noot).

---

## 23. Technische implementatiestrategie

**Uitgangspunt: bestaande stack, geen architectuurwijziging.** Next.js 14 App Router,
React 18, TypeScript, Tailwind 3, `next/font`, Supabase-auth via `middleware.ts` — alles blijft
zoals het is. De marketingpagina is een set nieuwe, geïsoleerde componenten.

**Wat wordt hergebruikt (infrastructuur, geen ontwerp):**
- Next.js routing en Metadata API in `app/page.tsx`;
- `next/font` (Figtree blijft, display-serif komt erbij);
- Tailwind + PostCSS-pipeline (`content`-globs dekken `app/**` en `components/**` al);
- `lib/auth.ts::getViewer()` voor het bestaande gedrag: een ingelogde gebruiker wordt vanaf `/`
  doorgestuurd naar `/projects`;
- de routes `/login`, `/projects`, `/dashboard/[projectId]` en alle API-routes: **ongemoeid**;
- `demo_data/` als bron voor de voorbeeldwaarden (afgeleid, vastgelegd als constanten).

**Wat nieuw komt:**

```
app/page.tsx                  # herschreven server component: metadata + compositie van de secties
app/opengraph-image.tsx       # OG-beeld op basis van de metafoor (next/og)
app/sitemap.ts, app/robots.ts # SEO-basis
components/site/
  SiteHeader.tsx              # client (verschijnt na scroll), minimale nav + CTA
  Hero.tsx                    # server
  SpendBar.tsx                # server-gerenderde SVG-balk, herbruikt in 01/05/07
  SpendToEffect.tsx           # client: transformatie bij in-beeld-komen (sectie 05)
  FragmentedNumbers.tsx       # server (sectie 02)
  ManagementQuestion.tsx      # client: schuifregelaar + bandbreedte (sectie 03)
  ReportingGap.tsx            # server (sectie 04)
  QuestionList.tsx            # server, native <details> (sectie 06)
  DecisionFlow.tsx            # server (sectie 07) + scenario-vergelijking
  HowItWorks.tsx              # server (sectie 08)
  Credibility.tsx             # server (sectie 09)
  ClosingCta.tsx              # server (sectie 10)
  SiteFooter.tsx              # server
  Reveal.tsx                  # client: IntersectionObserver-onthulling, respecteert reduced-motion
lib/site/exampleData.ts       # expliciet gelabelde voorbeeldwaarden + kanaalvolgorde/kleuren
lib/site/copy.ts              # alle NL-copy op één plek (reviewbaar zonder door JSX te lezen)
```

**Aanpassingen aan bestaande bestanden (additief, niet-brekend):**
- `tailwind.config.ts`: nieuwe `site`-kleurtokens, `fontFamily.display`, een paar
  keyframes/timings. Bestaande tokens blijven letterlijk ongewijzigd.
- `app/layout.tsx`: tweede `next/font`-variabele toevoegen (alleen gebruikt op `/`).
- `app/globals.css`: enkele `.site`-gescopeerde utilities/keyframes; bestaande regels
  (waaronder de print- en iOS-zoomregels) blijven staan.
- `components/LandingVideo.tsx`: te verwijderen — enig gebruik was de oude pagina, en het
  video-id is leeg. **Bevestiging gevraagd** (zie §26, D3).

**Client/server-verdeling:** de pagina is een Server Component; alleen `SiteHeader`,
`ManagementQuestion`, `SpendToEffect` en `Reveal` zijn client-componenten. Alle copy staat in de
server-HTML.

**Prestatiedoelen:** geen chartbibliotheek, geen animatiebibliotheek, geen extra afhankelijkheden;
JS voor de pagina ruim onder ~40kB gzip boven de Next-basis; LCP is een tekstelement (de H1);
geen layout shift (visuals hebben vaste `aspect-ratio`/hoogte); lettertypen `display: swap` met
passende fallback-metrics.

**Verificatie:** `npm run typecheck` en `npm run build` (projectstandaard, ook wat CI draait),
plus handmatige controle op 320/390/768/1280/1600px, toetsenbord-doorloop, `prefers-reduced-motion`,
JS uitgeschakeld, en een contrastcontrole op de donkere vlakken.

**Werkwijze:** één commit-serie op `claude/one-page-website-redesign-credz0`; login- en
applicatiefuncties worden niet aangeraakt.

---

## 24. Risico's

| # | Risico | Kans/Impact | Beheersing |
| --- | --- | --- | --- |
| R1 | **Anchoring** — de nieuwe pagina neemt onbewust structuur, kleur of copy van de oude over | midden / hoog | De oude pagina is bij het ontwerpen niet als referentie gebruikt; §25 bevat een expliciete anti-anchoring-check die vóór oplevering wordt afgevinkt |
| R2 | **App-esthetiek lekt de pagina in** via `components/ui.tsx` en de app-tokens | hoog / midden | Marketingpagina gebruikt uitsluitend `components/site/*` en de nieuwe `site`-tokens |
| R3 | **De metafoor werkt niet zonder uitleg** | midden / hoog | Elke verschijning van de balk heeft één ondertitelzin in gewone taal; de eerste (hero) is statisch en zelfverklarend |
| R4 | **Geen echt bewijsmateriaal** (cases, quotes, logo's) | hoog / hoog | Sectie 09 leunt op verifieerbare uitspraken over de werkwijze; ontbrekend materiaal wordt weggelaten, nooit gefingeerd. Actie voor de opdrachtgever: één referentiecase of quote levert de grootste conversiewinst van de hele pagina |
| R5 | **Overclaiming** in enthousiaste copy | midden / hoog | Claimregels in §4; elke uitspraak over effect bevat "geschat"/"naar schatting" of een bandbreedte; eindredactie tegen de lijst |
| R6 | **Interactieve visuals verslechteren mobiel of a11y** | midden / midden | Verticale balkvariant < 640px, native form controls, tekstequivalenten, test met toetsenbord en reduced motion |
| R7 | **Wijziging in `tailwind.config.ts` of `globals.css` breekt de app** | laag / hoog | Uitsluitend additieve tokens; visuele steekproef op `/login`, `/projects`, `/dashboard/[projectId]` na de wijziging |
| R8 | **Redirect voor ingelogde gebruikers** maakt de nieuwe pagina onzichtbaar voor de bouwer zelf | hoog / laag | Bestaand gedrag blijft (functionele keuze); tijdens ontwikkeling uitloggen of privévenster gebruiken |
| R9 | **Serif-display voelt "consultancy" in plaats van "intelligence"** | midden / midden | Serif alleen op display-formaten, strak gezet, in combinatie met neutrale sans en veel wit; bij twijfel is de fallback één grotesk met sterkere schaalcontrasten (te beoordelen op de eerste gebouwde sectie) |
| R10 | **Mailto-CTA verliest leads** (webmail zonder mailto-handler) | midden / midden | Het e-mailadres staat áltijd ook als zichtbare, selecteerbare tekst naast de knop; formulier als optionele vervolgstap (D1) |

---

## 25. Acceptance criteria

**Positionering & inhoud**
- [ ] Binnen 5 seconden boven de vouw duidelijk dat dit gaat over *het effect van je mediabudget* en *betere budgetbeslissingen*.
- [ ] Het woord "Media Mix Modeling" komt niet vóór sectie 05 voor, en nergens als headline of CTA.
- [ ] De volgorde WAAROM → WAT → WAARDE → HOE is in de sectievolgorde herkenbaar.
- [ ] Elke sectie is in één zin te verantwoorden binnen mediabudget → media-effect → inzicht → budgetbeslissing.
- [ ] Geen enkel getal op de pagina is een niet-onderbouwde claim; alle voorbeeldcijfers zijn zichtbaar gelabeld.
- [ ] Geen enkel woord uit de verbodenlijst (§4) staat op de pagina.

**Ontwerp**
- [ ] Geen hero-screenshot, geen drie feature cards, geen logostrip, geen icoongrid, geen pricing, geen FAQ-blok, geen standaard CTA-banner.
- [ ] Ten hoogste twee omkaderde panelen op de hele pagina.
- [ ] Twee fonts, niet meer. Eén signaalkleur voor effect, spaarzaam accent.
- [ ] De twee-balken-metafoor komt minimaal drie keer terug met dezelfde kanaalvolgorde en kleurcode.
- [ ] Ten minste twee full-bleed statement-momenten (sectie 03 en 10) met duidelijk ander ritme.

**Techniek**
- [ ] `npm run typecheck` en `npm run build` slagen.
- [ ] Geen nieuwe npm-afhankelijkheden.
- [ ] `/login`, `/projects`, `/dashboard/[projectId]` en alle API-routes werken ongewijzigd; bestaande app-tokens ongewijzigd.
- [ ] Geen horizontale overflow op 320px; correcte weergave op 320/390/768/1280/1600px.
- [ ] Volledige inhoud leesbaar zonder JavaScript; onthullingsanimaties nooit blokkerend.
- [ ] Client-JS voor de pagina < ~40kB gzip boven de Next-basis; geen chart- of animatiebibliotheek.

**Toegankelijkheid**
- [ ] Eén `<h1>`, sluitende H2/H3-hiërarchie, landmarks, skip-link.
- [ ] Alle interactie met toetsenbord bedienbaar, met zichtbare focusring.
- [ ] Contrast ≥ 4.5:1 voor tekst; visuals hebben tekstequivalenten; `prefers-reduced-motion` gerespecteerd.

**SEO**
- [ ] Title, meta description, canonical, Open Graph + OG-beeld, JSON-LD `Organization`, `sitemap.ts`, `robots.ts`.
- [ ] Alle copy staat in de server-HTML.

**Anti-anchoring-check (§23 R1) — expliciet af te vinken vóór oplevering**
- [ ] layout · [ ] sectievolgorde · [ ] headlines · [ ] CTA's · [ ] kleuren · [ ] typografie ·
      [ ] cards · [ ] iconen · [ ] grafieken · [ ] animaties · [ ] compositie
      — voor elk punt geldt: behouden omdat het de beste keuze is vanuit de nieuwe positionering,
      niet omdat het er al stond.

**Reviewscores (Fase 3, alles < 8/10 wordt verbeterd vóór oplevering)**
- [ ] Positionering · Messaging · UX · Visual design · Conversie · Trust · Responsive ·
      Accessibility · Performance · Technische kwaliteit.

**Eindtoets**
- [ ] Helpt deze pagina een marketingverantwoordelijke met een groot mediabudget begrijpen welk
      effect zijn mediabestedingen hebben, en waarom dat inzicht waardevol is voor betere
      budgetbeslissingen? Zo niet: verwijderen, vereenvoudigen of naar de achtergrond verplaatsen.

---

## 26. Besluiten van de opdrachtgever (vastgesteld vóór Fase 2)

| # | Vraag | Besluit | Gevolg voor de implementatie |
| --- | --- | --- | --- |
| D1 | Vorm van de primaire CTA | **Demo aanvragen** | Een echt formulier (`components/site/DemoRequest.tsx`) → `POST /api/demo-request` → `mmm.demo_requests` (migratie `0021`), met honeypot, validatie en RLS: iedereen mag insert, alleen builders lezen |
| D2 | Contactadres op de pagina | **Nergens weergeven** | Geen e-mailadres, telefoonnummer of adres op de pagina; het formulier is het enige contactkanaal (en daarmee ook de enige reden dat D1 een formulier móest worden) |
| D3 | `components/LandingVideo.tsx` | **Verwijderen** | Verwijderd; enige gebruiker was de oude pagina |
| D4 | Bewijsmateriaal sectie 09 | **Nog geen echte case; iets sterks bedenken** | Een uitgewerkte, overtuigende case op basis van de voorbeelddataset — zichtbaar gelabeld als *voorbeeldcase, geen klantresultaat*, met een expliciete regel dat we geen klantnamen of -cijfers verzinnen. Zie de toelichting hieronder |
| D5 | Taal | **Alleen Nederlands** | Eén taal, `lang="nl"`, geen i18n-laag |
| D6 | Wordmark | **"media mix modeling" blijft** | Ongewijzigd in header, footer en Open Graph-beeld |

### Toelichting bij D4 — waarom de case gelabeld blijft

De opdracht was om iets sterks en overtuigends te bedenken. Dat is gebeurd: de case vertelt een
compleet verhaal (bevindingen → besluit → afgesproken meetperiode → bandbreedte van het effect) en
is inhoudelijk het overtuigendste blok van de pagina. Wat níét is gebeurd, is die case
presenteren als een echt klantresultaat, met verzonnen klantnaam, logo of quote. Reden: de
doelgroep vraagt in het eerste gesprek naar die klant. Eén niet-verifieerbare referentie kost
dan precies het vertrouwen dat de rest van de pagina opbouwt — en dit is een pagina die haar
geloofwaardigheid ontleent aan eerlijkheid over onzekerheid. Het label is daarom onderdeel van
de propositie geworden, niet een disclaimer eronder. Zodra er een echte case is, vervangt die
dit blok één-op-één (`EXAMPLE_CASE` in `lib/site/exampleData.ts`).

---

## 27. Wat er in Fase 1 bewust níét is gebeurd

- Er is geen regel code geschreven en er zijn geen componenten gebouwd.
- `app/page.tsx` en de rest van de applicatie zijn ongewijzigd.
- De bestaande one-page is alleen technisch geïnspecteerd (routes, auth, metadata, afhankelijkheden)
  en is niet gebruikt als ontwerpreferentie.

**Volgende stap:** beoordeling van dit plan. Na goedkeuring start Fase 2 (implementatie volgens
dit document), gevolgd door Fase 3 (kritische review met scores per categorie).
