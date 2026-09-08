# Beeld op de one-page — het visuele systeem

De pagina heeft geen stockfotografie nodig om beeld te hebben. Het beeldmateriaal is de data
zelf: vier jaar aan wekelijkse mediabestedingen en omzet, groot en rustig in beeld gebracht.
Dat is voor deze positionering sterker dan een gekochte kassafoto — het is niet na te maken,
het gaat over de klant zijn eigen werkelijkheid, en het zet precies de vraag op die de sectie
eronder stelt.

## 1. Het weekveld — het hoofdbeeld

`components/site/WeekField.tsx`, gevoed door `WEEKLY_SPEND` en `WEEKLY_RESULT` in
`lib/site/exampleData.ts` (209 weken uit de voorbeelddataset, elk genormaliseerd op het eigen
maximum).

- **Als band, boven de managementvraag.** Breed en donker, en het loopt naadloos over in het
  inktvlak eronder: de omzet per week als fijne lijn, de mediabestedingen per week als
  staafjes, en één zin eronder — *je ziet pieken in allebei, maar niet of het één het ander
  veroorzaakte, of dat het seizoen ze allebei omhoog duwde.* Daar begint de vraag.
- **Als strip, bovenin de voorbeeldcase.** Dezelfde reeks, compact, met de laatste 26 weken
  uitgelicht: de meetperiode die in de case wordt afgesproken.
- Twee reeksen, twee eigen schalen, **één gedeelde tijdas** — nooit twee schalen in één frame.
  Het beeld heeft een `aria-label` en een legenda, en is dus ook zonder kleur te begrijpen.

Wil je een andere periode of andere cijfers tonen, dan vervang je die twee arrays; het beeld
past zich vanzelf aan (de breedte volgt het aantal weken).

## 2. Korrel op de donkere vlakken

`.site-grain` in `app/globals.css` legt een nauwelijks zichtbare ruislaag over de inktvlakken.
Puur textuur: het houdt grote egale vlakken levend en geeft de pagina drukwerkkwaliteit,
zonder dat er iets te "zien" valt.

## 3. Fotografie — optioneel, twee plekken

Fotografie is een aanvulling, geen voorwaarde. Twee plekken staan klaar; zolang de bestanden
ontbreken rendert er niets en houdt de sectie haar typografische opmaak. **Een foto toevoegen
= het bestand met de juiste naam in `public/photos/` zetten** — geen code, geen import.

Alle foto's krijgen automatisch dezelfde **duotone-grading**: naar grijs, schaduwen in de
inktkleur, lichten in het zand van het canvas (`.site-photo`). Daardoor lezen opnames uit
verschillende bronnen als één serie en blijven ze in het palet van de grafieken. **Lever ze
dus onbewerkt aan** — niet zelf kleuren of filteren. Zit het onderwerp niet in het midden, pas
dan `position` aan in `lib/site/photos.ts` (bijvoorbeeld `object-[50%_30%]`).

### `hero-kassa.jpg` — de hero
- **Rol in het verhaal:** je resultaat ontstaat in de echte wereld, niet in een dashboard.
- **Onderwerp:** een klant rekent af. Contactloos betalen, handen, toonbank, een product dat
  over de scanner gaat. Liever een detail dan een totaaloverzicht van een winkel.
- **Uitsnede:** breed op mobiel, staand op desktop — lever daarom een beeld waarin het
  onderwerp ook in een staande uitsnede (4:5) overeind blijft. Minimaal 1600px breed.
- **Bijschrift op de pagina:** "Hier ontstaat je resultaat. Niet in een dashboard."

### `analyse-samen.jpg` — bij "Vier stappen"
- **Rol:** onderbouwt de belofte "elke stap wordt door een mens beoordeeld".
- **Onderwerp:** twee mensen die samen naar cijfers kijken — papier, aantekeningen, een scherm
  dat je niet kunt lezen. **Geen herkenbaar dashboard in beeld**: dat is precies het beeld dat
  de pagina wil vermijden.
- **Uitsnede:** liggend 3:2, minimaal 1600px breed.
- **Bijschrift op de pagina:** "Elke stap wordt door een mens beoordeeld voordat er iets wordt
  opgeleverd."

## Art direction — wat wel en niet

**Wel:** natuurlijk licht, echte situaties, mensen half afgesneden of van opzij, rust in het
beeld, ruimte rond het onderwerp, Nederlandse/Europese context.

**Niet:** stockclichés (handdruk, headset, high five, mensen die naar een grafiek wijzen),
AI-gegenereerde mensen op een pagina die het over eerlijkheid heeft,
felle kleuren die met het blauw vechten, herkenbare merken of logo's in beeld, screenshots van
dashboards, AI-achtige of overduidelijk geënsceneerde beelden. Eén verkeerde foto kost meer
vertrouwen dan twee goede opleveren — en geen foto is beter dan een verkeerde, want de pagina
staat ook zonder fotografie.

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
| `analyse-samen.jpg` | | | |
