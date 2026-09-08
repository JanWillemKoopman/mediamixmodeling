# Ontwerpsysteem — publieke marketingsite

De publieke site (`app/page.tsx` + `components/site/`) is een eigen systeem, náást de
applicatie. De app-tokens (wizard, klantdashboard) veranderen er niet van mee en andersom.

## 1. Kleur

Alle sitekleuren staan als `site.*` in `tailwind.config.ts`; dezelfde waarden staan als CSS
custom properties op `#site` in `app/globals.css` (voor SVG's en inline styles).

| Rol | Token | Waarde |
| --- | --- | --- |
| Paginavlak | `site-canvas` | `#FAFBFC` |
| Kaart | `site-surface` / wit | `#FFFFFF` |
| Getint vlak | `site-surface-2` | `#F3F5F8` |
| Donker vlak | `site-ink` | `#080C16` |
| Paneel op donker | `site-ink-2` | `#0F1526` |
| Tekst | `site-text` | `#0B1020` |
| Tekst secundair | `site-text-muted` | `#525C74` |
| Lijn | `site-line` | `rgba(11,16,32,0.09)` |
| Accent / actie | `site-blue` | `#1F5AFF` |
| Accent op donker | `site-blue-ink` | `#7FA6FF` |

**Kleurregel van de hele site:** bestedingen zijn neutraal-grijs (`SPEND_STEPS`), effect is
blauw (`EFFECT_STEPS`). Er is geen derde signaalkleur. Identiteit hangt nooit alleen aan
kleur: elk segment heeft een label en een tekstequivalent.

## 2. Typografie

- **Inter** — UI en broodtekst (`font-sans`), gewichten 400/500/600.
- **Inter Tight** — koppen (`font-display`), 500/600, tracking `-0.02em` tot `-0.04em`.
- **JetBrains Mono** — technische microlabels, assen, metrics (`font-mono`), 400.

Koppen: `clamp()` op elke sectiekop via `SectionHead`. Broodtekst maximaal ~65 tekens breed.

## 3. Ruimte, radius, schaduw

- Container: `max-w-[76rem]`, productpanelen `max-w-[88rem]` (`Container wide`).
- Sectie: `py-20 sm:py-28 lg:py-32`, anker-offset via `.site-anchor`.
- Radius: `rounded-ctl` (10px) knoppen/velden, `rounded-card` (14px) kaarten,
  `rounded-panel` (20px) productpanelen.
- Schaduw: `shadow-site-card` (bijna plat), `shadow-site-lift`, `shadow-site-panel` (alleen
  het hero-paneel), `shadow-site-ink` (donkere secties).

## 4. Beweging

Eén curve (`cubic-bezier(0.22,1,0.36,1)`), drie snelheden (`--fast/--base/--slow`). Beweging
verklaart altijd iets; er is geen decoratieve animatie.

- `Reveal` — tekst/kaart komt van onderaf in beeld.
- `Anim` — figuurwrapper; zet `is-in` waarna `.site-bar`, `.site-bar-v`, `.site-draw`,
  `.site-fade` en `.site-stagger` naar hun eindstand gaan.
- `useCountUp` — getallen tellen op (rAF).
- `useStepper` — verhalende panelen lopen standen af; klikken pint de stand vast.

Regels: zonder JavaScript staat alles in de eindstand (`html.js` wordt vóór de eerste paint
gezet). Bij `prefers-reduced-motion: reduce` idem — geen enkele overgang.

## 5. Claimregels

Alle cijfers komen uit `lib/site/exampleData.ts` en zijn synthetisch. Elke visualisatie draagt
zichtbaar het label "Voorbeelddata"; de case draagt "Illustratief voorbeeld — niet gebaseerd op
klantdata". Effect wordt altijd geformuleerd als schatting mét bandbreedte ("geschatte
bijdrage", "geschat effect"), nooit als voorspelling of garantie. Er staan geen verzonnen
klantlogo's, quotes of resultaten op de site.

## 6. Een echte case toevoegen

`ProofSection` is al gebouwd op de zes velden in `PROOF_SLOTS` (`lib/site/copy.ts`): sector,
mediabudget, kanalen & historie, belangrijkste inzicht, budgetbeslissing, gemeten resultaat.
Vervang die tekstuele slots door de echte gegevens zodra een klant akkoord geeft; de
voorbeeldcase in `CaseSection` blijft daarnaast staan als publiek, controleerbaar voorbeeld.

## 7. Bestandsindeling

```
app/page.tsx              compositie, metadata, JSON-LD
components/site/
  primitives.tsx          Container, Section, SectionHead, Eyebrow, Button, paneel-chrome
  motion.tsx              useInView, Reveal, Anim, useCountUp, useStepper
  SiteHeader / SiteFooter navigatie en voettekst (woordmerk zit in SiteHeader)
  Hero + HeroConsole      opening en het interactieve productpaneel
  <Sectie>Section.tsx     één bestand per sectie, in de volgorde van de pagina
lib/site/copy.ts          alle lijst- en navigatiecopy
lib/site/exampleData.ts   alle cijfers, kleurschalen en het scenariomodel
```
