import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { EventLogger } from "@/components/EventLogger";

// De referentie zet alles in Aeonik — een gelicenseerde geometrische grotesk die we niet
// mogen meeleveren. Plus Jakarta Sans komt van de vrij beschikbare families het dichtst bij
// die vorm: geometrisch skelet, ronde bollingen, strak in kapitalen, en beschikbaar tot 800
// zodat de zware displaykoppen kloppen. Eén familie voor koppen én broodtekst, self-hosted
// via next/font (geen runtime-CDN).
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "media mix modeling",
  description: "Weet wat je mediabudget doet.",
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
      <head>
        {/* Zet de js-vlag vóór de eerste paint. Alle inhoud is standaard zichtbaar; alleen
            mét JavaScript starten onthullings- en balkanimaties in hun beginstand, zodat de
            pagina zonder JS volledig leesbaar blijft in plaats van leeg. */}
        <script
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
      </head>
      <body className="font-sans">
        {/* Het logboek: legt handelingen en fouten vast zodat een testronde achteraf na te
            lezen is. Zie docs/LOGBOEK.md. */}
        <EventLogger />
        {children}
      </body>
    </html>
  );
}
