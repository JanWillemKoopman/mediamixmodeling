import { existsSync } from "fs";
import path from "path";

/**
 * Fotografie op de one-page.
 *
 * Twee optionele plekken. Het beeldmateriaal van de pagina is de data zelf (zie
 * components/site/WeekField.tsx); fotografie is een aanvulling, geen voorwaarde. Waar ze
 * staat draagt ze een stap uit het argument: waar je resultaat ontstaat (hero) en dat een
 * mens elke stap beoordeelt (aanpak). Beide krijgen dezelfde duotone-grading in de
 * paginakleuren (zie .site-photo in globals.css), zodat ze als één serie lezen.
 *
 * De bestanden staan in `public/photos/`. Zolang een bestand ontbreekt rendert de plek
 * niets en valt de sectie terug op haar typografische opmaak — de pagina is dus altijd
 * compleet, ook halverwege een fotoshoot. Zie docs/one-page-website-fotografie.md voor de
 * opnamebrief per plek.
 */
export type PhotoSlot = "hero" | "work";

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
  work: {
    src: "/photos/analyse-samen.jpg",
    alt: "Twee collega's bekijken samen cijfers op papier en scherm.",
    caption: "Elke stap wordt door een mens beoordeeld voordat er iets wordt opgeleverd.",
    ratio: "aspect-[3/2]",
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
