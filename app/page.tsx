import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  Cpu,
  Database,
  GitMerge,
  Mail,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { getViewer } from "@/lib/auth";
import { LandingVideo } from "@/components/LandingVideo";

export const dynamic = "force-dynamic";

// Vul hier het YouTube-video-id in (het deel na `watch?v=`) zodra de walkthrough online
// staat. Zolang dit leeg is, toont de videosectie een nette placeholder in dezelfde vorm.
const YOUTUBE_VIDEO_ID = "";

const CONTACT_EMAIL = "koopman.janwillem@gmail.com";

export const metadata: Metadata = {
  title: "MMM Wizard — Media Mix Modeling, toegankelijk voor marketeers",
  description:
    "Van complexe Bayesiaanse Media Mix Modeling naar directe marketing­impact. Een tool voor datagedreven marketeers en analisten — zonder Python-notebooks, mét volledige rekenkracht en AI-ondersteuning. Gebouwd door Jan-Willem Koopman.",
  openGraph: {
    title: "MMM Wizard — Media Mix Modeling, toegankelijk voor marketeers",
    description:
      "Van complexe Bayesiaanse Data Science naar directe marketing­impact. Media Mix Modeling zonder Python-notebooks.",
    type: "website",
  },
};

const TECH_BADGES = ["Next.js 14", "PyMC", "Modal", "Claude AI"];

const PIPELINE = [
  { n: 1, label: "Data Upload", icon: Database },
  { n: 2, label: "Voorbereiden", icon: GitMerge },
  { n: 3, label: "Model Config", icon: SlidersHorizontal },
  { n: 4, label: "Resultaten", icon: TrendingUp },
];

const PILLARS = [
  {
    icon: Brain,
    emoji: "🧠",
    title: "Bayesiaanse Kern",
    tag: "mmm-core · PyMC",
    body: "Bevroren, geteste statistiek: adstock (carry-over) en Hill-saturatiecurves, met eerlijke onzekerheid. Elk resultaat komt met 94% credible intervals — geen schijnzekerheid, wél een besluitbaar bereik.",
  },
  {
    icon: Zap,
    emoji: "⚡",
    title: "Serverless High-Performance Compute",
    tag: "Modal",
    body: "Zware MCMC-sampling draait buiten de browser én buiten de LLM-sandbox. Geen 90-secondenlimiet, maar schaalbare Python-containers met de rekenkracht die een echt Bayesiaans model vraagt.",
  },
  {
    icon: Bot,
    emoji: "🤖",
    title: "AI Co-pilot",
    tag: "Claude API",
    body: "Een AI-architect ordent de data en stelt modelopties voor via getypeerde tools. De statistiek staat vast, de AI helpt met parametrisatie — en de mens houdt via mens-in-de-lus altijd de regie.",
  },
];

const WORKFLOW = [
  {
    n: 1,
    icon: Database,
    title: "Data Ingestie & Profilering",
    body: "Upload alle wekelijkse bronnen in één keer. Automatische kolom-classificatie en uitschieterdetectie geven de AI direct een voorsprong.",
  },
  {
    n: 2,
    icon: GitMerge,
    title: "Samenvoegen & Validatie",
    body: "Van losse bestanden naar één schone, wekelijkse tabel. Kwaliteitscontrole op datagaten en correlaties, voordat er ook maar iets gemodelleerd wordt.",
  },
  {
    n: 3,
    icon: SlidersHorizontal,
    title: "Model Config & Zakelijke Context",
    body: "Leg vast wat je over de klant weet — de grootste hefboom van het model. De AI vertaalt die context naar priors, kalibratie en kanaaltypes.",
  },
  {
    n: 4,
    icon: TrendingUp,
    title: "Fit, Diagnostiek & Budgetoptimalisatie",
    body: "Draai de fit op Modal, lees de diagnostiek terug en verdeel het marketingbudget voor maximale ROAS — met de onzekerheidsmarges altijd in beeld.",
  },
];

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-sm bg-surface-2 px-2.5 py-1 font-mono text-[11px] font-medium text-fg-muted">
      {children}
    </span>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm bg-brand-500/[0.08] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-600">
      {children}
    </span>
  );
}

export default async function Home() {
  // De ingelogde bouwer/klant hoeft de verkooppagina niet te zien — die stuurt de
  // originele flow direct door naar de projectenlijst. Bezoekers zónder sessie landen op
  // de marketing-one-pager hieronder.
  const viewer = await getViewer();
  if (viewer) redirect("/projects");

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* ─── Navigatie ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
          <Link
            href="/"
            className="flex-none text-[17px] font-bold lowercase tracking-tight text-brand-700 transition hover:text-accent"
          >
            media mix modeling
          </Link>

          <div className="hidden items-center gap-2 lg:flex">
            {TECH_BADGES.map((b) => (
              <Badge key={b}>{b}</Badge>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <a
              href="#architectuur"
              className="hidden text-sm font-medium text-fg-muted transition hover:text-fg md:inline"
            >
              Architectuur
            </a>
            <a
              href="#werkwijze"
              className="hidden text-sm font-medium text-fg-muted transition hover:text-fg md:inline"
            >
              Werkwijze
            </a>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-500"
            >
              Inloggen
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </nav>
      </header>

      {/* ─── Hero ──────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-gradient-to-b from-brand-500/[0.10] via-brand-500/[0.03] to-transparent blur-2xl"
        />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <SectionEyebrow>
                <Sparkles className="h-3.5 w-3.5" />
                Bayesiaanse MMM · in de praktijk
              </SectionEyebrow>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
                Van complexe Bayesiaanse Data Science naar{" "}
                <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
                  directe marketing­impact.
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg-muted">
                Maak Media Mix Modeling toegankelijk voor datagedreven marketeers en
                analisten. Zonder Python-notebooks, mét volledige rekenkracht en
                AI-ondersteuning.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-500"
                >
                  Bekijk de App (Inloggen)
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border-strong bg-surface px-6 py-3 text-sm font-semibold text-fg transition hover:bg-surface-2"
                >
                  <Mail className="h-4 w-4" />
                  Neem Contact Op
                </a>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-faint">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" />
                  Bevroren, geteste statistiek
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-success" />
                  Onbeperkte rekentijd
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  94% credible intervals
                </span>
              </div>
            </div>

            {/* App-preview: de 4-stappen pijplijn als strakke kaart. */}
            <div className="relative">
              <div className="rounded-2xl border border-border bg-surface p-6 shadow-panel sm:p-7">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-warn/50" />
                    <span className="h-2.5 w-2.5 rounded-full bg-success/50" />
                  </div>
                  <span className="font-mono text-[11px] text-fg-faint">mmm-wizard</span>
                </div>

                <p className="mt-5 text-sm font-medium text-fg-muted">De pijplijn</p>
                <div className="mt-3 space-y-2.5">
                  {PIPELINE.map((step, i) => (
                    <div key={step.n}>
                      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/60 px-3.5 py-3">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                          <step.icon className="h-4 w-4" />
                        </span>
                        <span className="flex-none font-mono text-xs text-fg-faint">
                          0{step.n}
                        </span>
                        <span className="text-sm font-medium text-fg">{step.label}</span>
                        {i === PIPELINE.length - 1 && (
                          <span className="ml-auto inline-flex items-center rounded-sm bg-success-dim px-2 py-0.5 text-[10px] font-medium text-success">
                            ROAS
                          </span>
                        )}
                      </div>
                      {i < PIPELINE.length - 1 && (
                        <div className="ml-[27px] h-2.5 w-px bg-border" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center justify-between rounded-xl bg-gradient-to-r from-brand-500/[0.08] to-transparent px-3.5 py-3">
                  <div className="flex items-center gap-2 text-xs text-fg-muted">
                    <Bot className="h-4 w-4 text-brand-600" />
                    AI-architect stelt de config voor
                  </div>
                  <span className="text-xs font-medium text-fg-faint">jij klikt</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Over de maker ─────────────────────────────────────────────────────── */}
      <section id="over" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-14">
          <div>
            <SectionEyebrow>Over de maker</SectionEyebrow>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              Jan-Willem Koopman
            </h2>
            <p className="mt-1 text-sm font-medium text-fg-muted">
              Data Analist bij Van den Udenhout
            </p>
            <div className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-panel">
              <p className="text-sm font-medium text-fg">De filosofie</p>
              <p className="mt-2 text-[15px] italic leading-relaxed text-fg-muted">
                “De statistiek is bevroren en getest, de AI helpt met parametrisatie, de
                mens heeft de regie.”
              </p>
            </div>
          </div>

          <div className="space-y-4 text-[15px] leading-relaxed text-fg-muted">
            <p>
              Bij Van den Udenhout bouwde ik een Media Mix Model dat nu de basis vormt voor
              budgetoptimalisaties. Ook bij eerdere werkgevers heb ik MMM-trajecten
              uitgevoerd — en steeds liep ik tegen dezelfde drempel aan.
            </p>
            <p>
              <span className="font-medium text-fg">De uitdaging.</span> MMM vereiste
              voorheen een Data Scientist die handmatig Python-notebooks draaide. De complexe
              statistiek begrijpelijk maken en de gebruikerservaring stroomlijnen — dáár zat
              de echte moeilijkheid. Voor de meeste marketeers en analisten lag de lat te
              hoog.
            </p>
            <p>
              <span className="font-medium text-fg">De AI-innovatie.</span> Met de komst van
              LLM&apos;s kan de complexe parametrisatie en data-interpretatie worden
              ondersteund door een AI-architect. Dat maakt Media Mix Modeling voor het eerst
              toegankelijk zonder de wiskunde uit handen te geven — praktijkervaring omgezet
              in een schaalbare tool voor datagedreven marketeers en analisten.
            </p>
            <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.05] p-5">
              <p className="text-sm font-medium text-fg">
                Het verschil met standaard AI-sandboxes
              </p>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                Chatbots zoals Claude of ChatGPT hebben een beperkte sandbox-runtime van
                ongeveer 90 seconden. MMM vereist zware MCMC-sampling (PyMC / NumPyro). Deze
                applicatie scheidt de AI-redenering van een dedicated serverless rekenlaag —
                een Modal Python-worker met onbeperkte rekenkracht.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Video walkthrough ─────────────────────────────────────────────────── */}
      <section id="video" className="border-y border-border bg-surface-2/50">
        <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="text-center">
            <SectionEyebrow>Product walkthrough</SectionEyebrow>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              Zie de volledige app in actie
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-fg-muted">
              Een korte doorloop van de hele wizard — van ruwe CSV&apos;s tot een
              gepubliceerd klantdashboard met budgetadvies.
            </p>
          </div>
          <div className="mt-8">
            <LandingVideo videoId={YOUTUBE_VIDEO_ID || null} />
          </div>
        </div>
      </section>

      {/* ─── Architectuur / tech showcase ──────────────────────────────────────── */}
      <section id="architectuur" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="max-w-2xl">
          <SectionEyebrow>
            <Server className="h-3.5 w-3.5" />
            Waarom deze architectuur uniek is
          </SectionEyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            Drie lagen, strikt gescheiden — elk met één taak
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
            De redenering, de rekenkracht en de statistiek zijn bewust uit elkaar getrokken.
            Dat maakt het betrouwbaar én reproduceerbaar.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="group relative flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-panel transition hover:border-brand-500/30"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                <p.icon className="h-5 w-5" />
              </span>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-wide text-fg-faint">
                {p.tag}
              </p>
              <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight">
                <span aria-hidden>{p.emoji}</span>
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Werkwijze / 4-stappen wizard ──────────────────────────────────────── */}
      <section id="werkwijze" className="border-t border-border bg-surface-2/50">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <SectionEyebrow>De workflow</SectionEyebrow>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              Van ruwe data naar budgetadvies in vier stappen
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
              Elke stap is een gestroomlijnde substap-flow — de AI stelt voor, jij
              controleert en keurt goed.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {WORKFLOW.map((s) => (
              <div
                key={s.n}
                className="flex gap-4 rounded-2xl border border-border bg-surface p-6 shadow-panel"
              >
                <div className="flex flex-none flex-col items-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/25">
                    <s.icon className="h-5 w-5" />
                  </span>
                  <span className="mt-2 font-mono text-xs text-fg-faint">Stap {s.n}</span>
                </div>
                <div>
                  <h3 className="text-base font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Contact CTA ───────────────────────────────────────────────────────── */}
      <section id="contact" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface px-6 py-12 shadow-panel sm:px-12 sm:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-500/[0.10] blur-3xl"
          />
          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Interesse in deze tool?
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-fg-muted">
              Bekijk de app zelf, of neem contact op voor een demo, een samenwerking of een
              MMM-traject voor jouw organisatie of klanten.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-500 sm:w-auto"
              >
                Bekijk de App (Inloggen)
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border-strong bg-surface px-6 py-3 text-sm font-semibold text-fg transition hover:bg-surface-2 sm:w-auto"
              >
                <Mail className="h-4 w-4" />
                {CONTACT_EMAIL}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8">
          <div className="text-sm font-bold lowercase tracking-tight text-brand-700">media mix modeling</div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-fg-muted">
            <a href={`mailto:${CONTACT_EMAIL}`} className="transition hover:text-fg">
              {CONTACT_EMAIL}
            </a>
            <Link href="/login" className="transition hover:text-fg">
              Inloggen
            </Link>
          </div>
          <p className="text-xs text-fg-faint">
            © {new Date().getFullYear()} Jan-Willem Koopman
          </p>
        </div>
      </footer>
    </div>
  );
}
