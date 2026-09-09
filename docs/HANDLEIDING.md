# Handleiding — een media mix model bouwen

Voor de bouwer die een MMM opzet voor een klant. Je hoeft geen statisticus te zijn: de app
weigert zelf wat niet kan en zegt het als een resultaat niet betrouwbaar genoeg is. Wat je
wél moet begrijpen is *wat je aan het beweren bent* — daar gaat deze handleiding over.

---

## 1. Waar een MMM over gaat

Een media mix model schat hoeveel van je KPI (omzet, orders, leads) door welk kanaal komt,
door te kijken hoe de KPI meebeweegt met de druk per kanaal, week na week. Drie dingen
maken het lastiger dan een gewone regressie:

**Nawerking (adstock).** Reclame van deze week werkt volgende week nog door. Het model
verdeelt de druk van een week over de weken erna. Hoe lang dat doorwerkt zeg jij in gewone
taal ("werkt vooral direct" / "werkt nog weken door"); het model vertaalt dat in een halfwaardetijd
en schat 'm daarna zelf bij.

**Verzadiging.** De tienduizendste euro doet minder dan de eerste. Daarom is de curve niet
recht maar afvlakkend. Dit is precies waarom je niet zomaar "ROAS × extra budget" mag
rekenen — dat is de fout die een MMM juist moet voorkomen.

**Verwarring (confounding).** Als je in december altijd meer uitgeeft én er altijd meer
verkocht wordt, kan het model kerst niet van je kerstcampagne onderscheiden. Daarom
modelleert het seizoen en trend apart, en daarom kijkt het of kanalen wel uit elkaar te
trekken zijn.

Wat je uiteindelijk krijgt is geen getal maar een **interval**. "Tussen €2,10 en €4,80 per
euro" is een eerlijk antwoord; "€3,45" is dat niet.

---

## 2. Wat je nodig hebt vóór je begint

- **Minimaal ~52 weken** data, liever twee jaar. Onder de ~30 weken kan het model seizoen
  en media niet scheiden en zal het dat zelf zeggen.
- **Per week één rij**, met een datumkolom.
- **Per kanaal een kolom met druk**: bij voorkeur spend in euro's. GRP's, impressies,
  clicks of verzendingen mogen ook — maar alleen kanalen in euro's krijgen een ROAS en
  tellen mee in budgetadvies. Dat is geen beperking van de app maar van de rekensom:
  "rendement per GRP" is geen bedrag.
- **Variatie.** Een kanaal met elke week hetzelfde budget levert geen informatie op. De app
  weigert zo'n kolom expliciet in plaats van er stilletjes ruis van te maken.
- **Controlvariabelen** als je ze hebt: prijs, distributie, weer, voorraad, een grote actie.

---

## 3. De stappen in de app

### Data uploaden
Sleep je CSV of Excel erin. De app detecteert encoding en scheidingsteken zelf. Je ziet
direct een voorbeeld met per kolom een voorgestelde rol (datum / KPI / kanaal / control).

**Controleer de rollen.** De AI stelt voor, jij bevestigt. Let vooral op kolommen die
per ongeluk als KPI of kanaal worden gelezen terwijl het een ordernummer of een index is —
de app herkent zulke kolommen, maar jij kent je data.

### Data-inspectie
Op de achtergrond kijkt de app dieper: uitschieters, niveausprongen, gaten, seizoenspatroon,
en kanalen die bijna hetzelfde verlopen. Dat laatste is belangrijk: twee kanalen die altijd
samen aan en uit gaan zijn statistisch niet te scheiden, hoe lang je ook rekent.

Je krijgt dit als opmerkingen te zien, niet als blokkade — behalve wat écht niet kan.

### Data voorbereiden
Één open vraag: zijn er bijzondere periodes (een actie, een storing, Black Friday) of
afgeleide variabelen die mee moeten? Beschrijf ze in gewone taal, of zeg **nee** om met de
standaard door te gaan. De AI stelt dan een recept voor; jij keurt het goed.

Daarna wordt de dataset samengesteld en krijg je een kwaliteitsrapport met een oordeel.
**Alleen een goedgekeurde dataset mag gemodelleerd worden.**

### Zakelijke context
Vertel wat je weet: branche, seizoenspatroon, offline kanalen die niet in de data zitten,
een prijsverandering, een experiment. Dit is de beste informatie die er is — het komt van
een mens die het bedrijf kent — en het weegt zwaar mee in de voorstellen.

### Modelspecificatie
Hier kies je (of laat je de AI voorstellen) **in woorden** hoe je denkt dat elk kanaal werkt:

| Vraag | Keuzes |
|---|---|
| Hoe lang werkt het door? | direct · kort · gemiddeld · lang |
| Hoe sterk werkt het? | zwak · gemiddeld · sterk |
| Zit het al tegen verzadiging? | nog lang niet · deels · vrijwel verzadigd |
| Hoe groot is het mediadeel van de KPI? | klein · gemiddeld · groot · dominant |

Er staat bewust nergens een getal. Jij (en de AI) beschrijven een *overtuiging*; de app
rekent die deterministisch om naar priors, en legt bij elke prior vast waar hij vandaan komt.

De eerlijkste antwoorden zijn hier meestal de voorzichtige. "Dominant" zeggen omdat het mooi
uitkomt, verschuift het antwoord — dat is precies wat een prior doet.

### Berekenen
De berekening draait op de achtergrond en duurt meestal enkele minuten. Je ziet welke stap
bezig is. Twee dingen kunnen hier gebeuren:

- **De aannamecontrole zakt.** Vóór de echte berekening toetst de app of je aannames de
  waargenomen data überhaupt toelaten. Zakt dat, dan is er geen berekening — en dat is
  goed nieuws, want het model zou anders een antwoord hebben gegeven dat volledig door je
  aannames werd bepaald. Pas je overtuiging aan (meestal: minder stellig) en probeer opnieuw.
- **Het rekenen zelf mislukt.** Je krijgt een Nederlandse melding met wat eraan te doen is.

### Beoordelen
Je krijgt een **oordeel in vier niveaus**, en dat oordeel bepaalt wat je te zien krijgt:

| Oordeel | Wat het betekent | Wat je ermee mag |
|---|---|---|
| **Niet bruikbaar** | De berekening of de aannames zijn gefaald | niets |
| **Berekend, niet betrouwbaar genoeg** | Er staan getallen, maar ze zijn niet te vertrouwen | alleen de diagnostiek bekijken |
| **Statistisch in orde** | Convergentie, fit en dekking kloppen | bijdragen tonen, publiceren |
| **Bruikbaar om budget op te sturen** | Bovendien: kanalen zijn uit elkaar te houden | ROAS en budgetadvies |

Dit is geen advies dat je kunt negeren: onder het vereiste niveau wordt het blok simpelweg
niet getoond, en er wordt geen klantsamenvatting geschreven. Een model dat klaar is met
rekenen is niet hetzelfde als een model dat iets betekent.

Zakt het door: lees de blokkerende redenen. De meest voorkomende zijn te weinig weken,
kanalen die niet uit elkaar te trekken zijn, en te weinig variatie in een kanaal. Dat zijn
**databeperkingen** — je lost ze niet op door het model anders in te stellen.

### Publiceren
Alleen een resultaat dat de drempel haalt kan naar het klantdashboard. De klant ziet
uitsluitend gepubliceerde resultaten, read-only, altijd met de onzekerheid erbij.

---

## 4. Hoe je het aan een klant uitlegt

- **Noem altijd het interval.** "Ergens tussen de €2 en €5 per euro, meest waarschijnlijk
  rond €3" is bruikbaar en eerlijk. Eén getal noemen suggereert een precisie die er niet is.
- **Correlatie blijft correlatie.** Een MMM is observationeel. De sterkste uitspraak die je
  kunt doen is: "als dit patroon zo blijft, verwachten we dit." Wil je harder bewijs, dan
  is een experiment (geo-lift, holdout) de enige route — en dat is ook de enige manier
  waarop een ROAS in deze app gekalibreerd mag worden.
- **Zeg wat het model níét kon zien.** Kanalen die niet in de data zaten, een merkcampagne
  die er niet in stond, een periode met rare data.
- **Extrapoleer niet buiten het bereik.** Als een kanaal nooit meer dan €10k per week kreeg,
  weet het model niets over €50k. De verzadigingscurve zégt daar wel iets, maar met een
  interval dat zo breed is dat het geen advies meer is.

---

## 5. Wat de AI wel en niet doet

De AI in deze app legt uit, stelt vragen, interpreteert je data en doet voorstellen. Ze
schrijft **geen** modelcode, zet **geen** priors als getal, start **geen** berekening en
kan een model **niet** goed verklaren. Elk voorstel komt langs jou voordat er iets gebeurt,
en de rekenkern leidt de priors zelf opnieuw af uit de intentie — niet uit wat de AI zegt.

Dat is met opzet: een taalmodel is uitstekend in uitleggen en slecht in het inschatten van
een getal dat het antwoord mede bepaalt.
