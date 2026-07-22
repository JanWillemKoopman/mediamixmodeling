import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
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

export const metadata: Metadata = {
  title: "MMM Wizard",
  description: "Bouw een Bayesiaans media mix model en publiceer een klantdashboard.",
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
    <html lang="nl" className={sans.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
