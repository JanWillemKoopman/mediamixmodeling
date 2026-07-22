# SIMPLIFICATION_PLAN.md — "Don't Make Me Think" voor de MMM-app

> Analyse van de hele MMM-app tegen de designfilosofie van Steve Krug
> (*Don't Make Me Think*). Doel: elk scherm, elke keuze en elke stap
> vanzelfsprekend maken — de gebruiker mag nooit hoeven nadenken over wat iets
> betekent of wat de volgende stap is.
>
> **Status: alle 11 items uit STAP 2 zijn doorgevoerd.** `npm run typecheck` en
> `npm run build` zijn na de volledige set wijzigingen groen bevestigd.
>
> Verificatie na elke wijziging: `npm run typecheck` en `npm run build` moeten
> groen zijn (geen testsuite in dit project).
>
> Harde randvoorwaarden (mogen nooit sneuvelen door versimpeling):
> - Rollen-/RLS-logica en de scheiding builder ↔ klant blijven intact.
> - Credible intervals blijven zichtbaar in het klantdashboard.
> - Minder is meer: complexiteit verwijderen/verbergen gaat vóór uitleg toevoegen.

---

## STAP 1 — Analyse per scherm

### A. De builder/operator in de wizard (`app/projects/[id]`)

De wizard is een chat-gestuurde, deterministische toestandsmachine met 8 fases
(`lib/wizard/phase.ts`): upload → inspect → prepare → context → tuning →
modelspec → fitting → review/published. Links de chat + fasekaart, rechts een
read-only model-dossier met genummerde voortgang.

**Wat sterk is (DMMT-conform):**
- De genummerde voortgang in `ModelDossier` beantwoordt "waar ben ik?" en
  afgeronde stappen zijn klikbaar om terug te gaan — zonder de echte voortgang
  te wissen. Goede, geruststellende terugkoppeling.
- Elke fase heeft precies één primaire groene knop met een "…& door naar"-label:
  de volgende stap is bijna altijd duidelijk.
- Foutmeldingen zijn uitzonderlijk goed: `lib/humanizeMessage.ts` vertaalt vrijwel
  elke Python/worker/Supabase-fout naar mensvriendelijk, oplossingsgericht
  Nederlands, met de ruwe melding inklapbaar eronder. Dit is precies DMMT.
- De architect-systeemprompt (`lib/anthropic/architect.ts`) is voorbeeldig
  geïnstrueerd voor de doelgroep: advies vooraan, geen jargon, één aanbeveling
  i.p.v. een menukaart, adstock/saturatie/prior de eerste keer in gewone taal.

**Waar de gebruiker tóch moet nadenken:**
1. **De vaste fase-teksten (`lib/wizard/script.ts`) zijn het jargon-zwaarst** — en
   dit is de MEEST gelezen tekst in de hele flow (0 tokens, altijd zichtbaar). Ze
   houden zich níét aan de regels die de architect-prompt aan Claude oplegt:
   "MCMC-sampling", "prior predictive check", "posterior", "credible intervals",
   "divergenties", "Bayesiaans", "prior-elicitatie" staan gewoon in de altijd-
   zichtbare bubbels (fases `tuning`, `fitting`, `review`). Inconsistentie: de AI
   praat mensentaal, de vaste UI niet.
2. **De `TuningCard` is het schrikbeeld van "Don't Make Me Think":** per kanaal
   channel_type + adstock + saturatie + halfwaarde, plús twee uitklap-secties
   (≈9 prior-velden, kalibratie), plús een baseline-blok (ruismodel, trend,
   seizoen, Fourier, baseline-priors), plús een prior-predictive-check. Dat is
   tientallen velden. Er staat wel een geruststellende introzin, maar de primaire
   knop is "Tuning bevestigen" (= niets doen) náást een secundaire "Laat de AI
   optimaliseren" — terwijl juist die AI-knop de happy path is.
3. **Twee zeer technische stappen (tuning, modelspec) staan pal vóór de payoff.**
   `ModelSpecCard` is in de praktijk "bevestig de sampler-instellingen die niemand
   aanpast". Dat is een hele extra beslis-stap op de happy path die grotendeels
   auto-default kan zijn.
4. **De "diepgaande data-inspectie (optioneel)"** hangt midden in de inspect-stap,
   die verder alleen "bevestig de kolommen" is. Extra keuze in een stap die
   vanzelfsprekend zou moeten zijn.
5. **Stale stap-verwijzingen.** `SummaryView` en `ScenarioPlanner` zeggen "Vul de
   marge in (stap 3)", maar de marge wordt ingevoerd in de context-stap (nu stap
   4). De gebruiker gaat op zoek naar een stap die niet bestaat.
6. **Knop-labels zijn soms lang/technisch:** "Tuning bevestigen & door naar
   modelspecificatie", "Goedkeuren als definitieve dataset", "Voeg samen &
   controleer kwaliteit".

### B. De klant in het read-only dashboard (`app/dashboard/[projectId]`)

**Wat sterk is (DMMT-conform):**
- Volgorde klopt: `ClientSummaryCard` (verhaal in klanttaal) → `DashboardHelp`
  ("Zo lees je dit dashboard in 6 punten") → `Headline` (conclusie in geldtaal) →
  vertrouwen → acties → grafieken. Business vóór statistiek.
- Versheidsstempel (datavenster + laatst bijgewerkt) = goed vertrouwenssignaal.
- Vaste voetnoot legt het 94%-interval in gewone taal uit; credible intervals
  blijven overal zichtbaar. `Term`-tooltips geven jargon-uitleg op de plek zelf.

**Waar de klant tóch moet nadenken:**
7. **`SummaryView` wordt gedeeld tussen builder én klant**, waardoor builder-taal
   naar de klant lekt:
   - De **twee-laags `TrustBadge`** toont "Laag 1 — Sampler-betrouwbaarheid" met
     kale "Max R-hat / Min ESS / Divergenties" en "Laag 2" met "R² / MAPE /
     Dekking". Die twee-lagen-splitsing bestaat om de *builder* naar de juiste fix
     te routeren (tuning vs. data) — voor de klant is dat onderscheid betekenisloos
     en ESS/R-hat zijn onbegrijpelijk. (De credible intervals zelf blijven natuurlijk
     staan; het gaat om de kale sampler-diagnostiek.)
   - De **"(stap 3)"-marge-instructie** verschijnt bij de klant als de marge leeg
     is — terwijl de klant die helemaal niet kán invullen. Een instructie waar de
     lezer niets mee kan is de zuiverste vorm van "make me think".
8. **De logo-link in `TopBar` gaat altijd naar `/projects`** — ook op het
   klantdashboard. Een klant die op het logo klikt belandt op een dead-end
   (`NoBuilderAccess`).

### C. Claude-communicatie (prompts + volgorde)

- **Architect-prompt (`architect.ts`) en klantsamenvatting (`clientSummary.ts`)
  zijn goed op de doelgroep afgestemd.** De schrijfregels zijn expliciet en juist.
- **De zwakke plek is niet de AI maar de statische copy eromheen:** de vaste
  fase-scripts en enkele kaartteksten worden niet aan diezelfde lat gelegd. De
  audience-mismatch zit in de hand-geschreven UI, niet in de AI-output.

### D. Documentatie
9. **`README.md` is feitelijk verouderd:** §Structuur beschrijft de verwijderde
   verticale stepper ("1 Data → 2 Model → 3 Fits → 4 Resultaten") i.p.v. de huidige
   chat-wizard met 8 fases. De landingspagina (`app/page.tsx`) hanteert een
   "4-stappen"-vereenvoudiging die voor marketing verdedigbaar is, maar het mentale
   model dat de bezoeker vormt wijkt af van wat hij in de app tegenkomt.

---

## STAP 2 — Optimalisatielijst (gesorteerd op impact/effort — quick wins bovenaan)

| # | Wat (bestand/component) | Waarom — DMMT-principe | Effort | Impact | Status |
|---|---|---|---|---|---|
| 1 | **Vaste fase-teksten herschrijven in klanttaal** — `lib/wizard/script.ts`: jargon eruit ("MCMC", "prior predictive check", "posterior", "credible intervals", "divergenties", "Bayesiaans"), advies vooraan, korter. Dezelfde regels die de architect-prompt al oplegt. | "Omit needless words"; geen jargon dat de lezer niet spontaan zou zeggen. Dit is de meest-gelezen tekst in de flow. | **Laag** — pure copy, geen logica. | **Hoog** — raakt elke builder, elke fase. | ✅ Uitgevoerd |
| 2 | **Stale "(stap 3)"-marge-verwijzing fixen én verbergen voor de klant** — `components/SummaryView.tsx` (`Headline`) + `components/ScenarioPlanner.tsx`. Instructie alleen tonen in de bouwerscontext (`useWizardChatOptional()` is al beschikbaar) en naar de juiste stap verwijzen. | "Don't make me think": een instructie die de lezer niet kan uitvoeren (klant kan geen marge invullen) én een verkeerd stapnummer sturen de gebruiker op een zoektocht. | **Laag** | **Midden-Hoog** — verwijdert verwarring uit de klantweergave. | ✅ Uitgevoerd |
| 3 | **"Laat de AI optimaliseren" tot primaire actie maken op de tuning-stap** en het handmatige tuning-blok inklappen achter "Zelf instellen (geavanceerd)" — `components/wizard/cards.tsx` (`TuningCard`). | Happy path zonder nadenken: de novice hoeft niet tientallen velden te wegen; de standaard = "laat het model/AI het doen". Complexiteit verbergen i.p.v. uitleggen. | **Laag-Midden** — herschikking + één `<details>`; geen backend-wijziging. | **Hoog** — dit is het meest overweldigende scherm. | ✅ Uitgevoerd |
| 4 | **README + docs bijwerken naar de echte chat-wizard** — `README.md` §Structuur; philosophie doortrekken. | Correct mentaal model vóór gebruik; docs moeten kloppen. Expliciet gevraagd in de opdracht. | **Laag** | **Midden** | ✅ Uitgevoerd |
| 5 | **Klant-versie van het vertrouwensoordeel vereenvoudigen** — `components/SummaryView.tsx` (`TrustBadge`): voor de klant één helder verdict ("Betrouwbaarheid: goed/let op/zwak") tonen en de kale metrics (R-hat, ESS, MAPE, divergenties) achter een "Details"-inklap; voor de builder (`chat != null`) de volledige twee-laags weergave + terug-knoppen behouden. | Jargon verbergen waar het niet nodig is, zónder het vertrouwenssignaal of de correctheid op te offeren (credible intervals blijven zichtbaar). | **Midden** — conditionele render, twee paden. | **Hoog** — haalt de zwaarste statistiek uit de primaire klantweergave. | ✅ Uitgevoerd |
| 6 | **Knop-labels inkorten** door de hele wizard — `cards.tsx`: bv. "Doorgaan", "Dataset goedkeuren", "Samenvoegen & controleren". | Duidelijke, korte call-to-action; minder leeslast per beslismoment. | **Laag** | **Midden** | ✅ Uitgevoerd |
| 7 | **Logo-link in `TopBar` context-bewust maken** — `components/ui.tsx`: op het klantdashboard niet naar `/projects` (dead-end voor de klant) linken. | Geen dead-ends; elke klik moet ergens zinnigs heen. | **Laag** | **Midden** | ✅ Uitgevoerd |
| 8 | **"Diepgaande data-inspectie (optioneel)" minder prominent / verplaatsen** — `cards.tsx` (`InspectCard`): de inspect-stap puur "bevestig de kolommen & ga door" laten zijn. | Onnodige keuze weghalen uit een stap die vanzelfsprekend hoort te zijn. | **Laag** | **Laag-Midden** | ✅ Uitgevoerd |
| 9 | **De modelspec-stap samenvouwen** — sampler-instellingen auto-defaulten en de fit direct vanaf "tuning bevestigen" starten, met de rekeninstellingen achter "Geavanceerd". Verwijdert één beslis-stap van de happy path (`phase.ts`, `script.ts`, `cards.tsx`). | Minder stappen/keuzes op de happy path; de meeste gebruikers raken de sampler-instellingen nooit aan. | **Midden** — raakt de fase-FSM; zorgvuldig getest. | **Midden-Hoog** | ✅ Uitgevoerd — wizard is nu 7 stappen i.p.v. 8 |
| 10 | **Mobiel: compacte "Stap X van 7" altijd tonen** i.p.v. de voortgang in een `<details>` te verstoppen — `app/projects/[id]/page.tsx`. | "Waar ben ik?" moet altijd beantwoord zijn, ook op klein scherm. | **Laag** | **Laag** | ✅ Uitgevoerd |
| 11 | **Consistente naamgeving "de AI" vs. "Claude"** richting de builder — `cards.tsx` (`ReviewCard`). | Consistentie verlaagt cognitieve wrijving (Krug: conventies). | **Laag** | **Laag** | ✅ Uitgevoerd |

**Aanbevolen quick-win-batch om mee te starten:** #1, #2, #3, #4 — samen laag in
effort, hoog in merkbaar gebruiksgemak, en raken zowel de builder- als de
klantbeleving zonder aan de backend, RLS of de zichtbaarheid van credible
intervals te komen.

---

## STAP 3 — Uitgevoerd

Alle 11 items zijn op verzoek doorgevoerd op branch
`claude/mmm-simplification-analysis-rvoti3` (en gemerged naar `main`). Kern van de
wijzigingen:

- **Copy-only** (#1, #2, #6, #11): jargon uit de vaste fase-teksten, de stale
  margeverwijzing gefixt/verborgen voor de klant, kortere knoplabels, consistent
  "de AI" i.p.v. "Claude" in bouwersgerichte tekst.
- **Herstructurering zonder backend-wijziging** (#3, #5, #7, #8): AI-optimalisatie
  gepromoot in de tuning-stap met het handmatige blok achter "geavanceerd", het
  klant-vertrouwensoordeel vereenvoudigd tot één verdict (bouwersweergave met de
  volledige twee-laags diagnostiek blijft ongewijzigd), de logo-link op het
  klantdashboard wijst niet langer naar een dead-end, de diepe data-inspectie zit
  nu achter een inklap.
- **FSM-wijziging** (#9): de losse "modelspecificatie"-stap is opgegaan in de
  tuning-stap — bevestigen start in één klik zowel de tuning-opslag als de
  berekening, met de rekeninstellingen (chains/draws/tuning-stappen/target_accept/
  cross-validatie/placebo) als geavanceerd blok met geteste standaardwaarden. De
  wizard telt nu 7 stappen i.p.v. 8 (`lib/wizard/phase.ts`, `lib/wizard/script.ts`,
  `components/wizard/cards.tsx`, `components/wizard/ChatWizard.tsx`,
  `app/projects/page.tsx`). `ModelSpecCard` is verwijderd (dode code na de merge);
  de "berekening mislukt"-kaart valt nu terug op `TuningCard` om opnieuw te tunen
  en te herberekenen.
- **Doc-only** (#4, #10): README beschrijft nu de echte 7-fase chat-wizard plus de
  ontwerpfilosofie-sectie; de mobiele voortgangsindicator toont het actuele
  stapnummer altijd, ook zonder open te tikken.

Randvoorwaarden gecontroleerd: de rollen-/RLS-logica is niet aangeraakt, credible
intervals blijven overal zichtbaar (ook in de vereenvoudigde klantweergave, achter
"Details"), en `npm run typecheck` + `npm run build` zijn na de volledige set
wijzigingen groen bevestigd.
