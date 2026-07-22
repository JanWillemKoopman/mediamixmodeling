"use client";

import { Printer } from "lucide-react";

// Print / opslaan-als-PDF voor een board-deck. De print-CSS in globals.css verbergt de
// navigatie en klapt alle ingeklapte secties open, zodat de volledige analyse op papier
// komt. Zelf gemarkeerd met data-print="hide" zodat de knop niet meeprint.
export function PrintButton() {
  return (
    <button
      data-print="hide"
      onClick={() => window.print()}
      className="inline-flex flex-none items-center gap-1.5 rounded-full border border-accent/70 bg-transparent px-3.5 py-2 text-sm font-semibold text-accent transition hover:bg-accent-dim focus:outline-none focus-visible:shadow-glow-sm"
    >
      <Printer className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Print / PDF</span>
    </button>
  );
}
