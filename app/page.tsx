import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { siteUrl } from "@/lib/site/siteUrl";
import { CaseSection } from "@/components/site/CaseSection";
import { CtaSection } from "@/components/site/CtaSection";
import { DecisionsSection } from "@/components/site/DecisionsSection";
import { EffectSection } from "@/components/site/EffectSection";
import { Hero } from "@/components/site/Hero";
import { MethodSection } from "@/components/site/MethodSection";
import { ProblemSection } from "@/components/site/ProblemSection";
import { ProofSection } from "@/components/site/ProofSection";
import { ReportingSection } from "@/components/site/ReportingSection";
import { ScenarioSection } from "@/components/site/ScenarioSection";
import { ShiftSection } from "@/components/site/ShiftSection";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { TrustSection } from "@/components/site/TrustSection";

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

// Beschrijft de organisatie en de dienst feitelijk — geen beoordelingen of claims die we
// niet kunnen hardmaken.
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
 * De publieke site. Eén doorlopend verhaal in vier bewegingen: de vraag (waarom rapportage
 * niet genoeg is), het effect (wat de analyse laat zien), de beslissing (wat je ermee doet)
 * en de onderbouwing (hoe het werkt en wat je níét mag concluderen).
 */
export default async function Home() {
  // Een ingelogde bouwer heeft niets aan de commerciële pagina: door naar de projecten.
  const viewer = await getViewer();
  if (viewer) redirect("/projects");

  return (
    <div id="site" className="bg-site-canvas text-site-text">
      <a
        href="#main"
        className="sr-only rounded-ctl bg-site-blue px-5 py-3 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]"
      >
        Naar de inhoud
      </a>

      <SiteHeader />

      <main id="main">
        <Hero />
        <ProblemSection />
        <ReportingSection />
        <ScenarioSection />
        <EffectSection />
        <DecisionsSection />
        <ShiftSection />
        <CaseSection />
        <ProofSection />
        <MethodSection />
        <TrustSection />
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
