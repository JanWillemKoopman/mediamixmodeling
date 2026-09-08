import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Eén moderne grotesk draagt de hele site: Inter voor UI en broodtekst. Wordt bij de build
// self-hosted (geen runtime-CDN).
const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

// Display: dezelfde skelet-vorm, krapper getekend. Grote koppen krijgen daardoor een
// eigen stem zonder dat de pagina naar een tijdschrift of rapport gaat ruiken.
const display = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
  display: "swap",
});

// Mono voor de technische microlabels in de productpanelen (metrics, assen, statusregels).
// Dat is wat een datavisualisatie laat lezen als software in plaats van als infographic.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono",
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
    <html lang="nl" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
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
