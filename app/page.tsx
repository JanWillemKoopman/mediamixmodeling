import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { siteUrl } from "@/lib/site/siteUrl";
import { Credibility } from "@/components/site/Credibility";
import { DecisionFlow } from "@/components/site/DecisionFlow";
import { DemoRequest } from "@/components/site/DemoRequest";
import { Hero } from "@/components/site/Hero";
import { HowItWorks } from "@/components/site/HowItWorks";
import { Insight } from "@/components/site/Insight";
import { ManagementQuestion } from "@/components/site/ManagementQuestion";
import { ProblemNoise } from "@/components/site/ProblemNoise";
import { QuestionList } from "@/components/site/QuestionList";
import { ReportingGap } from "@/components/site/ReportingGap";
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

export default async function Home() {
  // Een ingelogde bouwer heeft niets aan de commerciële pagina: door naar de projecten.
  const viewer = await getViewer();
  if (viewer) redirect("/projects");

  return (
    <div id="top" className="bg-site-canvas text-site-text">
      <a
        href="#main"
        className="sr-only rounded-full bg-site-effect px-5 py-3 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]"
      >
        Naar de inhoud
      </a>

      <SiteHeader />

      <main id="main">
        <Hero />
        <ProblemNoise />
        <ManagementQuestion />
        <ReportingGap />
        <Insight />
        <QuestionList />
        <DecisionFlow />
        <HowItWorks />
        <Credibility />
        <DemoRequest />
      </main>

      <SiteFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </div>
  );
}
