import type { Metadata, Viewport } from "next";
import { Figtree, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Strakke, moderne typografie in de geest van Starbucks' SoDo Sans: één heldere,
// humanistische sans voor zowel koppen als broodtekst — geen serif, geen klinische
// tech-font. Wordt bij de build self-hosted (geen runtime-CDN).
const sans = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

// Display-serif voor de publieke one-page: één gewicht, latin-subset, self-hosted. Levert
// het editoriale karakter dat de pagina onderscheidt van een standaard SaaS-landingspagina.
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "media mix modeling",
  description: "Inzicht in het effect van je mediabudget.",
};

// maximumScale voorkomt dat iOS Safari bij focus op een invoerveld automatisch inzoomt
// (en ingezoomd blijft, waardoor de pagina niet meer op volledige breedte staat).
// Handmatig knijp-zoomen blijft op iOS gewoon werken — Safari negeert deze limiet
// bewust voor gebruikersgebaren, dus toegankelijkheid blijft intact.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${sans.variable} ${display.variable}`}>
      <head>
        {/* Zet de js-vlag vóór de eerste paint. Alle inhoud is standaard zichtbaar; alleen
            mét JavaScript starten onthullings- en balkanimaties in hun beginstand, zodat de
            pagina zonder JS volledig leesbaar blijft in plaats van leeg. */}
        <script
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
