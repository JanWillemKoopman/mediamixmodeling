import { existsSync } from "fs";
import path from "path";

/**
 * Fotografie op de one-page.
 *
 * Vier plekken, geen enkele decoratief: elke foto draagt een stap uit het argument
 * (waar je resultaat ontstaat → wie de vraag stelt → hoe het werk gebeurt → in welke
 * werkelijkheid de case speelt). Alle foto's krijgen dezelfde duotone-grading in de
 * paginakleuren (zie .site-photo in globals.css), zodat losse opnames als één serie lezen.
 *
 * De bestanden staan in `public/photos/`. Zolang een bestand ontbreekt rendert de plek
 * niets en valt de sectie terug op haar typografische opmaak — de pagina is dus altijd
 * compleet, ook halverwege een fotoshoot. Zie docs/one-page-website-fotografie.md voor de
 * opnamebrief per plek.
 */
export type PhotoSlot = "hero" | "question" | "work" | "case";

export interface PhotoSpec {
  /** Pad onder /public. */
  src: string;
  /** Beschrijft wat er te zien is, voor wie de foto niet ziet. */
  alt: string;
  /** Bijschrift dat de foto aan het verhaal van de sectie koppelt. */
  caption?: string;
  /** Beeldverhouding van de uitsnede. */
  ratio: string;
  /** Waar de uitsnede naartoe trekt bij smalle schermen. */
  position?: string;
}

export const PHOTOS: Record<PhotoSlot, PhotoSpec> = {
  hero: {
    src: "/photos/hero-kassa.jpg",
    alt: "Een klant rekent af bij de kassa van een winkel.",
    caption: "Hier ontstaat je resultaat. Niet in een dashboard.",
    // Breed op mobiel (waar hij onder de kop staat), staand zodra hij ernaast past.
    ratio: "aspect-[3/2] lg:aspect-[4/5]",
    position: "object-[50%_40%]",
  },
  question: {
    src: "/photos/directie-overleg.jpg",
    alt: "Enkele mensen in een vergaderruimte in gesprek over een plan.",
    ratio: "aspect-[16/9] sm:aspect-[21/9]",
    position: "object-[50%_45%]",
  },
  work: {
    src: "/photos/analyse-samen.jpg",
    alt: "Twee collega's bekijken samen cijfers op papier en scherm.",
    caption: "Elke stap wordt door een mens beoordeeld voordat er iets wordt opgeleverd.",
    ratio: "aspect-[3/2]",
    position: "object-[50%_50%]",
  },
  case: {
    src: "/photos/winkel-schap.jpg",
    alt: "Een klant kiest een product uit het schap in een winkel.",
    // Geen bijschrift: deze foto staat bovenin de casekaart, waar het label eronder
    // ("Voorbeeldcase — …") het bijschrift al is.
    // Brede uitsnede: de foto opent de kaart, hij mag hem niet overheersen.
    ratio: "aspect-[3/2] sm:aspect-[16/7]",
    position: "object-[50%_50%]",
  },
};

/**
 * Staat het bestand er al? Alleen te gebruiken in Server Components — het leest van de
 * bestandsschijf op de server en nooit in de browser.
 */
export function hasPhoto(slot: PhotoSlot): boolean {
  return existsSync(path.join(process.cwd(), "public", PHOTOS[slot].src));
}
