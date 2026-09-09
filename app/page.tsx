import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { siteUrl } from "@/lib/site/siteUrl";
import { AudienceSection } from "@/components/site/AudienceSection";
import { CtaSection } from "@/components/site/CtaSection";
import { DecisionSection } from "@/components/site/DecisionSection";
import { Hero } from "@/components/site/Hero";
import { MeasurementSection } from "@/components/site/MeasurementSection";
import { ModelSection } from "@/components/site/ModelSection";
import { OutcomesSection } from "@/components/site/OutcomesSection";
import { PerspectiveSection } from "@/components/site/PerspectiveSection";
import { ProcessSection } from "@/components/site/ProcessSection";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

// Leest de ingelogde gebruiker (cookies), dus per request renderen.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Je weet hoeveel je aan media uitgeeft. Wij maken het geschatte effect van je mediabestedingen zichtbaar, zodat je je mediabudget beter kunt verdelen en onderbouwen.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Weet wat je mediabudget doet — inzicht in het effect van je mediabestedingen",
  description: DESCRIPTION,
  keywords: [
    "media mix modeling",
    "media-effect",
    "mediabudget",
    "budgetverdeling",
    "marketing effectiviteit",
    "marketinganalyse",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "nl_NL",
    url: "/",
    siteName: "media mix modeling",
    title: "Weet wat je mediabudget doet",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Weet wat je mediabudget doet",
    description: DESCRIPTION,
  },
};

// Beschrijft de dienst feitelijk — geen beoordelingen of claims die we niet kunnen hardmaken.
const structuredData = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "media mix modeling",
  url: siteUrl(),
  areaServed: "NL",
  description:
    "Analyse van het geschatte effect van mediabestedingen op het bedrijfsresultaat, als onderbouwing voor budgetbeslissingen.",
  serviceType: "Media Mix Modeling",
};

/**
 * De publieke site: negen hoofdstukken die als één verhaal doorlopen, van de vraag "wat doet
 * ons mediabudget?" tot de uitnodiging om er samen naar te kijken. Elk hoofdstuk heeft één
 * visualisatie; de tekst doet de rest.
 */
export default async function Home() {
  // Een ingelogde bouwer heeft niets aan de commerciële pagina: door naar de projecten.
  const viewer = await getViewer();
  if (viewer) redirect("/projects");

  return (
    <div id="site" className="bg-site-paper text-site-ink">
      <a
        href="#main"
        className="sr-only rounded-full bg-site-violet px-5 py-3 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]"
      >
        Naar de inhoud
      </a>

      <SiteHeader />

      <main id="main">
        {/* Eén doorlopend verhaal: de vraag, waarom hij moeilijk te beantwoorden is, welk
            perspectief dat verandert, wat het model oplevert, welke beslissing je ermee neemt,
            wat je uiteindelijk krijgt, hoe het werkt, voor wie het is, en de uitnodiging. */}
        <Hero />
        <MeasurementSection />
        <PerspectiveSection />
        <ModelSection />
        <DecisionSection />
        <OutcomesSection />
        <ProcessSection />
        <AudienceSection />
        <CtaSection />
      </main>

      <SiteFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </div>
  );
}
