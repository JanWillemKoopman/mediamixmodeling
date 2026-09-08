# Fase 3 — kritische review van de nieuwe one-page

Review na implementatie, met opzet hard: gezocht naar generieke SaaS-patronen, zwakke copy,
onduidelijke messaging, visuele rommeligheid, te veel cards, te veel techniek, zwakke CTA,
slechte mobiele ervaring, overmatige animatie en gebrek aan onderscheidend vermogen.
Wat hieronder onder de 8 uitkwam, is vóór oplevering aangepast; de scores zijn de stand ná die
aanpassingen, met de motivatie erbij.

## Scores

| # | Categorie | Score | Onderbouwing |
| --- | --- | --- | --- |
| 1 | Positionering | **9** | De H1 gaat over een budgetbeslissing, niet over een tool. "Media Mix Modeling" valt pas in sectie 05, als methodische noot onder de figuur, en nergens in een kop of CTA. Geen woord over Bayesiaans, MCMC, adstock, AI of dashboards op de hoofdroute. |
| 2 | Messaging | **9** | Elke sectie volgt meten → begrijpen → beslissen. Verbodenlijst (unlock, maximaliseer, AI-powered, next-generation…) komt nergens voor. Alle effectuitspraken zijn geformuleerd als schatting mét bandbreedte. |
| 3 | UX | **8,5** | Eén doorlopend argument, vier ankers, één laag progressive disclosure (native `<details>`). Volledige toetsenbordbediening, skip-link als eerste focusbare element, logische tabvolgorde geverifieerd. |
| 4 | Visual design | **8,5** | Data als beeldmateriaal: 209 weken groot in beeld, plus korrel op de donkere vlakken (zie hieronder). Editoriale serif + neutrale sans, twee fonts, veel wit, ritme van licht/zand/inkt. Twee omkaderde panelen op de hele pagina, geen icoongrid, geen feature cards, geen screenshot-hero. |
| 5 | Conversie | **8** | Eén primaire actie op drie plekken, formulier met vier verplichte velden, "voor wie" vlak vóór het formulier, en een secundaire CTA die naar bewijs in de pagina zelf leidt in plaats van naar een belofte. |
| 6 | Trust | **8** | Alleen verifieerbare uitspraken over de werkwijze, elke schatting met marge, en een expliciete regel dat we geen klantnamen of -cijfers verzinnen. Blijft op 8 tot er een echte case is; dat is de enige weg naar een 9+. |
| 7 | Responsive | **9** | Mobile-first opgezet; geen horizontale overflow op 320, 390, 768, 1280 en 1600px (gemeten). Balklabels verdwijnen ordelijk op smalle schermen, percentages blijven. |
| 8 | Accessibility | **9** | Sluitende koppenhiërarchie (H1→H2→H3→H4, geen sprongen), landmarks, alle lijsten valide, elke figuur met tekstequivalent, `aria-live` op de schuifregelaar, zichtbare focusring op licht én donker, `prefers-reduced-motion` gerespecteerd, alle tekstcontrasten ≥ 4,5:1 (berekend). |
| 9 | Performance | **9,5** | 4,5 kB pagina-JS bovenop de Next-basis (101 kB First Load), geen chart- of animatiebibliotheek, geen nieuwe dependencies, self-hosted fonts, alle copy server-gerenderd. |
| 10 | Technische kwaliteit | **9** | `npm run typecheck` en `npm run build` groen, additieve Tailwind-tokens, geen enkele wijziging aan applicatiecomponenten, login- en dashboardroutes onaangeraakt. |

## Wat er tijdens de review is aangepast

| Bevinding | Oordeel | Aanpassing |
| --- | --- | --- |
| Sectie 02 was een "wolk" van losse cijferfragmenten | Zag eruit als decoratie, niet als argument; oogde gegenereerd | Vervangen door een opsomming van wat er wél wordt gerapporteerd, met als sluitregel *Effect van je media op de omzet — niet gerapporteerd*. Zelfde punt, in één blik te lezen |
| Bandbreedte-grafiek in sectie 09 zonder as | Onleesbaar: balken leken zwevende voortgangsbalken | Hulplijnen per rij plus één gedeelde as (0–30%) onder de lijst |
| Segmentlabels vielen weg in smalle balken | Afgekapte tekst ("Radio & ove…") | Labeldrempel verhoogd; smalle segmenten tonen alleen het percentage, de legenda draagt de namen |
| Koptekst brak op mobiel over twee regels | Rommelig eerste beeld op telefoon | Compacte koptekst: wordmark en CTA `nowrap`, inlogtekstlink pas vanaf `sm` (blijft in de footer staan) |
| Sectie 07 en 08 lazen als twee keer dezelfde processtappen | Echo in het verhaal | Sectie 08 herkaderd naar het traject met ons, met een leadregel die het onderscheid maakt |
| `<ol>` met `<div>`-wrappers eromheen | Ongeldige HTML; schermlezers kondigen de lijst niet als lijst aan | Onthullingswrapper naar binnen verplaatst, `<ol>` bevat weer alleen `<li>` |
| Balken waren volledig `aria-hidden` | Hero- en scenariobalken hadden geen tekstequivalent | `srSummary` op elke balk, plus de bestaande verborgen datatabel bij de hoofdfiguur |
| Contrast: accenttekst 2,7:1, hulptekst op zand 4,0:1, labels op middentonen 3,5:1, kleine print op inkt 3,6:1 | Vier keer onder AA | Aparte leesbare accentkleur (`site.accent-text`), hulptekst donkerder (#636C7D), segmentlabels op volle dekking, kleine print van 40/45% naar 60% wit |
| Verborgen datatabel duwde de pagina 518px breed | Horizontale scroll op mobiel | `sr-only` op een wrapper in plaats van op de `<table>` |

## Beeld

De pagina had een puur typografisch/abstract karakter; er ontbrak beeld met massa. Dat is
opgelost zonder stockfotografie, met het materiaal dat het onderwerp zelf levert: **209 weken
mediabestedingen en omzet**, groot in beeld. Als brede donkere band loopt die reeks over in het
inktvlak met de managementvraag — je ziet pieken in allebei, maar niet wat wat veroorzaakte, en
precies daar begint de vraag. Als compacte strip opent dezelfde reeks de voorbeeldcase, met de
26 weken meetperiode uitgelicht. Twee reeksen, twee eigen schalen, één gedeelde tijdas — nooit
twee schalen in één frame — met legenda en tekstequivalent. Daarnaast ligt er een nauwelijks
zichtbare korrellaag over de donkere vlakken, die grote egale vlakken levend houdt.

Waarom geen foto's: in deze omgeving is geen enkele beeldbank bereikbaar, de opdrachtgever
heeft zelf geen beeldmateriaal, en AI-gegenereerde mensen op een pagina die haar geloofwaardigheid
aan eerlijkheid ontleent is een risico dat niet opweegt tegen de winst. Twee fotoplekken (hero
en "Vier stappen") blijven wel klaarstaan mét de gedeelde duotone-grading: een bestand in
`public/photos/` activeert ze, en zolang dat er niet is houdt de sectie haar opmaak. De
opnamebrief en het hele visuele systeem staan in `docs/one-page-website-beeld.md`.

## Wat bewust niet is gedaan

- **Geen verzonnen klantnaam, logo of quote.** Zie de toelichting bij besluit D4 in het plan.
- **Geen recharts op de marketingpagina.** De visuals zijn handgeschreven SVG/CSS; recharts hoort bij het klantdashboard en zou de pagina zowel zwaarder als dashboardachtiger maken.
- **Geen wijziging aan bestaande app-tokens of -componenten.** De marketingpagina heeft een eigen tokenset (`site.*`) en eigen componenten (`components/site/`).

## Openstaande punten voor de opdrachtgever

1. **Een echte case is de grootste resterende conversiehefboom.** Eén klant die met naam, cijfer of quote naar buiten wil, tilt sectie 09 direct naar een 9+.
2. **Er staat nu geen enkele organisatie-identiteit op de pagina** (besluit D2: geen contactgegevens tonen). Dat is een bewuste keuze, maar het is ook de belangrijkste reden dat Trust op een 8 blijft in plaats van hoger: een bezoeker met een groot mediabudget zoekt naar wie erachter zit. Overweeg minimaal een bedrijfsnaam in de footer.
3. **De bevestiging na verzending belooft contact binnen twee werkdagen.** Die belofte staat in `components/site/DemoRequest.tsx` en moet waargemaakt worden — of aangepast.
4. **Zet `NEXT_PUBLIC_SITE_URL`** zodra het definitieve domein bekend is; canonical, Open Graph en sitemap gebruiken die waarde (nu valt hij terug op de Vercel-URL).
5. **Demo-aanvragen staan in `mmm.demo_requests`** en zijn alleen leesbaar voor builders. Er gaat nog geen notificatie uit; een mailtrigger of een klein overzicht in `/projects` is een logische vervolgstap.

## Eindtoets

> Helpt dit een marketingverantwoordelijke met een groot mediabudget begrijpen welk effect zijn
> mediabestedingen hebben en waarom dat inzicht waardevol is voor betere budgetbeslissingen?

Ja. De pagina opent met wat hij wél weet (waar zijn geld staat), laat zien wat hij niet weet
(wat het doet), stelt de vraag die zijn directie stelt, verklaart waarom zijn huidige
rapportages die vraag niet beantwoorden, en laat vervolgens in één beeld zien wat het antwoord
eruitziet — inclusief de marge. Pas daarna hoort hij hoe die analyse heet.
