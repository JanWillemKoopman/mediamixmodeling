# Fotografie op de one-page — opnamebrief en werking

De pagina heeft vier fotoplekken. Ze zijn geen decoratie: elke foto draagt één stap uit het
argument, en samen vertellen ze de menselijke kant van hetzelfde verhaal dat de grafieken
abstract vertellen — *waar je resultaat ontstaat* → *wie de vraag stelt* → *hoe het werk
gebeurt* → *in welke werkelijkheid de case speelt*.

## Hoe het technisch werkt

- De configuratie staat in `lib/site/photos.ts`, het component in `components/site/Photo.tsx`.
- **Een foto toevoegen = het bestand met de juiste naam in `public/photos/` zetten.** Meer niet:
  geen code, geen import, geen deploy-configuratie.
- Zolang een bestand ontbreekt rendert die plek niets en houdt de sectie haar typografische
  opmaak. De pagina is dus op elk moment compleet — ook als er nog maar één foto is.
- Alle foto's krijgen automatisch dezelfde **duotone-grading**: naar grijs, schaduwen in de
  inktkleur van de pagina, lichten in het zand van het canvas (`.site-photo` in
  `app/globals.css`). Daardoor lezen opnames uit verschillende bronnen als één serie en
  blijven ze in hetzelfde palet als de grafieken. **Lever de foto's dus onbewerkt aan** —
  niet zelf kleuren, filteren of verdonkeren.
- Uitsnede: de foto vult het kader (`object-cover`). Zit het onderwerp niet in het midden,
  pas dan `position` aan in `lib/site/photos.ts` (bijvoorbeeld `object-[50%_30%]` om hoger in
  het beeld uit te snijden).

## De vier plekken

### 1. `hero-kassa.jpg` — de hero
- **Rol in het verhaal:** je resultaat ontstaat in de echte wereld, niet in een dashboard.
- **Onderwerp:** een klant rekent af. Contactloos betalen, handen, toonbank, een product dat
  over de scanner gaat. Liever een detail dan een totaaloverzicht van een winkel.
- **Uitsnede:** breed op mobiel, staand op desktop — lever daarom een beeld waarin het
  onderwerp ook in een staande uitsnede (4:5) overeind blijft. Minimaal 1600px breed.
- **Bijschrift op de pagina:** "Hier ontstaat je resultaat. Niet in een dashboard."

### 2. `directie-overleg.jpg` — de band boven de managementvraag
- **Rol:** dit is de kamer waar de vraag "wat gebeurt er als we ons budget verschuiven?"
  gesteld wordt.
- **Onderwerp:** enkele mensen in gesprek aan een tafel. Ingetogen, geen geposeerde
  vergaderfoto, geen handdruk, geen presentatie met grafieken in beeld.
- **Uitsnede:** zeer breed (21:9 op desktop). De onderste ~40% van het beeld verdwijnt in het
  donkere vlak eronder — houd het onderwerp dus in de **bovenste helft**. Minimaal 2400px
  breed.
- **Geen bijschrift:** de foto loopt over in de sectie.

### 3. `analyse-samen.jpg` — bij "Vier stappen"
- **Rol:** onderbouwt de belofte "elke stap wordt door een mens beoordeeld".
- **Onderwerp:** twee mensen die samen naar cijfers kijken — papier, aantekeningen, een scherm
  dat je niet kunt lezen. **Geen herkenbaar dashboard in beeld**: dat is precies het beeld dat
  de pagina wil vermijden.
- **Uitsnede:** liggend 3:2, minimaal 1600px breed.
- **Bijschrift op de pagina:** "Elke stap wordt door een mens beoordeeld voordat er iets wordt
  opgeleverd."

### 4. `winkel-schap.jpg` — bovenin de voorbeeldcase
- **Rol:** geeft de case een werkelijkheid: een landelijke retailer, online én winkels.
- **Onderwerp:** een klant kiest een product uit het schap, of een winkelstraat/winkelinterieur
  met mensen. Rustig, niet druk.
- **Uitsnede:** breed (16:7 op desktop), minimaal 2000px breed. Onderwerp in het midden houden.
- **Geen los bijschrift:** het label "Voorbeeldcase — samengesteld uit een voorbeelddataset,
  geen klantresultaat" staat er direct onder en dient als bijschrift.

## Art direction — wat wel en niet

**Wel:** natuurlijk licht, echte situaties, mensen half afgesneden of van opzij, rust in het
beeld, ruimte rond het onderwerp, Nederlandse/Europese context.

**Niet:** stockclichés (handdruk, headset, high five, mensen die naar een grafiek wijzen),
felle kleuren die met het blauw vechten, herkenbare merken of logo's in beeld, screenshots van
dashboards, AI-achtige of overduidelijk geënsceneerde beelden. Eén verkeerde foto kost meer
vertrouwen dan vier goede opleveren.

## Rechten en techniek

- **Rechten:** alleen beeld met een licentie voor commercieel gebruik. Staan er herkenbare
  personen op, dan is een model release nodig; herkenbare winkelinterieurs kunnen een property
  release vragen. Leg per foto de bron en licentie vast (bijvoorbeeld in dit document), zodat
  later te herleiden is waar het beeld vandaan komt.
- **Formaat:** JPEG, sRGB, kwaliteit ~80. Streef per bestand naar maximaal ~400 KB; Next.js
  schaalt en optimaliseert automatisch naar de gevraagde breedtes, dus lever één groot bestand
  aan in plaats van meerdere maten.
- **Namen:** exact zoals hierboven. Een andere naam betekent: `lib/site/photos.ts` aanpassen.

## Bron en licentie per foto (in te vullen bij oplevering)

| Bestand | Bron | Licentie | Model/property release |
| --- | --- | --- | --- |
| `hero-kassa.jpg` | | | |
| `directie-overleg.jpg` | | | |
| `analyse-samen.jpg` | | | |
| `winkel-schap.jpg` | | | |
