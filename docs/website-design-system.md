# Ontwerpsysteem en opbouw — publieke marketingsite

De publieke site (`app/page.tsx` + `components/site/`) is een eigen systeem, náást de
applicatie. De app-tokens (wizard, klantdashboard) veranderen er niet van mee en andersom.

## 1. Het verhaal

De site is geen verzameling blokken maar één doorlopend verhaal in negen hoofdstukken. Elk
hoofdstuk heeft ruimte voor tekst én precies één visualisatie; de bezoeker bouwt begrip op in
plaats van elke honderd pixels opnieuw een belofte te lezen.

| # | Sectie | Anker | Wat het hoofdstuk doet |
| --- | --- | --- | --- |
| 1 | `Hero` | `#top` | De vraag, en meteen het beeld: budget → kanalen → resultaat → geschatte bijdrage |
| 2 | `MeasurementSection` | `#meten` | Waarom die vraag vandaag moeilijk te beantwoorden is |
| 3 | `PerspectiveSection` | `#perspectief` | Attributie volgt één reis; MMM kijkt naar het geheel |
| 4 | `ModelSection` | `#model` | Wat de analyse oplevert: resultaat, factoren, bijdrage met marge |
| 5 | `DecisionSection` | `#beslissing` | Twee budgetverdelingen naast elkaar, interactief |
| 6 | `OutcomesSection` | `#inzichten` | Wat je uiteindelijk krijgt, als één opsomming |
| 7 | `ProcessSection` | `#werkwijze` | De route van data naar besluit, compact |
| 8 | `AudienceSection` | — | Voor wie dit relevant is |
| 9 | `CtaSection` | `#demo` | De uitnodiging en het formulier |

## 2. Kleur

Sitekleuren staan als `site.*` in `tailwind.config.ts`; dezelfde waarden staan als CSS custom
properties op `#site` in `app/globals.css` (voor SVG's en inline styles).

| Rol | Token | Waarde |
| --- | --- | --- |
| Papier | `site-paper` | `#FFFFFF` |
| Genest vlak | `site-paper-2` / `-3` | `#F7F7F7` / `#F0F0F1` |
| Inkt | `site-ink` | `#0B0B0C` |
| Lopende tekst | `site-muted` | `#63636A` |
| Bijschrift | `site-muted-2` | `#9A9AA2` |
| Lijn | `site-line` | `#E5E5E5` |
| Actie | `site-violet` | `#8511D9` |
| Effect (tekst) | `site-green-text` | `#24803F` |
| Effect (vlak) | `site-green` | `#B9EFA3` |

**Regel:** bestedingen zijn neutraal grijs, geschatte bijdrage is groen, en violet is
voorbehouden aan actie en aan het alternatieve scenario. Meer kleuren gebruikt de site niet.

## 3. Typografie

Eén familie: **Plus Jakarta Sans** (400–800), self-hosted via `next/font`. Microlabels draaien
op de systeem-mono, wat een webfont scheelt.

- `.u-display` — kapitaal, `letter-spacing -.03em`, `line-height 1`, gewicht 800.
- `.u-h1` / `.u-h2` / `.u-h3` — de drie kopmaten, alle drie met `clamp()`.
- `.u-grad` — de tweede regel van een kop, met verloop groen → violet.
- `.u-label` — mono, klein, ruim gespatieerd, kapitaal: het meest herkenbare detail.
- `.u-sub` — introtekst, `max-width 58ch`.
- `.u-watermark` — reusachtig lichtgrijs woord achter een sectiekop, puur ritme.

## 4. Oppervlakken en knoppen

`.u-card` (radius 22px) voor productpanelen, `.u-tile` (16px) voor kleine kaarten, `.u-inset`
(13px) voor genestelde vlakken, `.u-pill` voor chips. Knoppen zijn pillen: `.u-btn-primary`
(violet), `.u-btn-ghost` (wit met haarlijn). Container: `max-w-[120rem]`, `px-5 xl:px-16`.

## 5. Beweging

Eén curve (`cubic-bezier(0.22,1,0.36,1)`), drie snelheden. Beweging verklaart altijd iets.

- `Reveal` — tekst en kaarten komen van onderaf in beeld.
- `Anim` — figuurwrapper; zet `is-in`, waarna `.site-bar`, `.site-draw`, `.site-fade` en
  `.site-stagger` naar hun eindstand gaan.
- `useCountUp` — getallen tellen op; `useStepper` — verhalende panelen lopen standen af.

Zonder JavaScript en bij `prefers-reduced-motion` staat alles direct in de eindstand.

## 6. Claimregels

Alle cijfers komen uit `lib/site/exampleData.ts` en zijn synthetisch. Elke visualisatie draagt
zichtbaar het label "Illustratief voorbeeld". Effect wordt altijd geformuleerd als schatting
mét bandbreedte, nooit als voorspelling of garantie. Er staan geen verzonnen klantnamen,
logo's, quotes of resultaten op de site.

## 7. Bestandsindeling

```
app/page.tsx              compositie, metadata, JSON-LD
components/site/
  primitives.tsx          Container, Section, SectionHead, Label, Button, kaartchrome
  motion.tsx              useInView, Reveal, Anim, useCountUp, useStepper
  SiteHeader / SiteFooter navigatie en voettekst (woordmerk zit in SiteHeader)
  Hero + HeroFlow         hoofdstuk 1 en de openingsvisual
  <Hoofdstuk>Section.tsx  één bestand per hoofdstuk, in de volgorde van de pagina
lib/site/copy.ts          alle lijst- en navigatiecopy
lib/site/exampleData.ts   alle cijfers, kleurschalen en het scenariomodel
```
