import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/ui";
import { NoBuilderAccess } from "@/components/NoAccess";
import { ChatWizard } from "@/components/wizard/ChatWizard";
import { ModelDossier } from "@/components/wizard/ModelDossier";
import { WizardChatProvider } from "@/components/WizardChatContext";
import { derivePhase } from "@/lib/wizard/phase";
import { PHASE_SCRIPT, PHASE_STEPS, stepIndexForPhase } from "@/lib/wizard/script";
import { getHandleidingMarkdown } from "@/lib/handleiding";
import type { BusinessContextNote, Dataset, Job, JobConfig, ModelRun, Project, SourceFile } from "@/lib/types";

export const dynamic = "force-dynamic";

// De chat-gestuurde wizard: één doorlopend gesprek links dat de bouwer stap voor stap door
// het hele MMM-proces loodst, met rechts een read-only model-dossier dat de vorderingen en
// alle vastgelegde kennis toont. Dit IS de wizard — de eerdere verticale stepper-pagina is
// vervangen (zie git-historie voor de oude implementatie). De backend (jobs, mmm-core,
// worker, RLS) is ongewijzigd.
export default async function ProjectDetail({ params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isBuilder) return <NoBuilderAccess email={viewer.email} />;

  const supabase = createClient();
  const { data: project } = await supabase.schema("mmm").from("projects").select("*").eq("id", params.id).maybeSingle();
  if (!project) notFound();
  const p = project as Project;

  const [{ data: sources }, { data: jobs }, { data: runs }, { data: datasets }, { data: projectContext }] =
    await Promise.all([
      supabase.schema("mmm").from("source_files").select("*").eq("project_id", p.id).order("created_at"),
      supabase.schema("mmm").from("jobs").select("*").eq("project_id", p.id).order("created_at", { ascending: false }),
      // Trimmed columns: `analysis` bevat base64-PNG's van de diepe-analysestap en kan
      // fors zijn per run. RunHistory heeft alleen summary.quality_gate + datums nodig;
      // analysis/client_summary worden hieronder apart voor de nieuwste run opgehaald.
      supabase
        .schema("mmm")
        .from("model_runs")
        .select("id, project_id, job_id, summary, quality, is_published, created_at, published_at")
        .eq("project_id", p.id)
        .order("created_at", { ascending: false }),
      supabase
        .schema("mmm")
        .from("datasets")
        .select("*")
        .eq("project_id", p.id)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .schema("mmm")
        .from("project_context")
        .select("industry, notes, description")
        .eq("project_id", p.id)
        .maybeSingle(),
    ]);

  const sourceList = (sources ?? []) as SourceFile[];
  const jobList = (jobs ?? []) as Job[];
  const dataset = ((datasets ?? []) as Dataset[])[0] ?? null;
  const businessNotes = ((projectContext?.notes as BusinessContextNote[] | null) ?? []) as BusinessContextNote[];
  const industry = (projectContext?.industry as string | null) ?? null;
  const companyDescription = (projectContext?.description as string | null) ?? null;

  const runsList = (runs ?? []) as ModelRun[];
  let latestAnalysis: ModelRun["analysis"] = null;
  let latestClientSummary: ModelRun["client_summary"] = null;
  if (runsList[0]) {
    const { data: analysisRow } = await supabase
      .schema("mmm")
      .from("model_runs")
      .select("analysis, client_summary")
      .eq("id", runsList[0].id)
      .maybeSingle();
    latestAnalysis = (analysisRow?.analysis as ModelRun["analysis"]) ?? null;
    latestClientSummary = (analysisRow?.client_summary as ModelRun["client_summary"]) ?? null;
  }
  const runsWithAnalysis: ModelRun[] = runsList.map((r, i) => ({
    ...r,
    analysis: i === 0 ? latestAnalysis : null,
    client_summary: i === 0 ? latestClientSummary : null,
    inference_data_path: null,
  }));
  // job_id -> fit-config, voor de "config hergebruiken"-knop in de run-historie.
  const jobConfigById = Object.fromEntries(
    jobList.filter((j) => j.type === "fit" || j.type === "fit_hierarchical").map((j) => [j.id, j.config]),
  ) as Record<string, JobConfig>;

  const contextProvided =
    Boolean(industry) || Boolean(companyDescription) || businessNotes.length > 0 || p.kpi_margin != null;
  const phase = derivePhase({ sources: sourceList, dataset, jobs: jobList, runs: runsWithAnalysis, contextProvided });

  return (
    <>
      <TopBar email={viewer.email} guideMarkdown={getHandleidingMarkdown()} />
      <div className="mx-auto max-w-[1800px] px-4 pt-4 sm:px-6">
        <Link href="/projects" className="text-sm text-fg-muted transition hover:text-fg">
          ← Projecten
        </Link>
      </div>
      <WizardChatProvider>
        <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-0 px-4 pb-4 pt-3 sm:px-6 lg:grid-cols-[1fr_22rem] lg:gap-6">
          {/* Mobiel/tablet: het dossier is naast de chat verborgen onder lg, dus tonen we het
              hier als inklapbaar paneel bóven de chat — anders mist de bouwer op kleine
              schermen alle voortgang en de terug-naar-stap-navigatie. "Waar ben ik?" moet
              ook zonder open te tikken al beantwoord zijn, dus de samenvattingsregel zelf
              toont altijd het actuele stapnummer + label — alleen het volledige dossier
              (kolommen, context, resultaten) zit achter de tik. */}
          <details className="mb-3 rounded-2xl border border-border bg-surface-2 lg:hidden">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fg">
              Stap {stepIndexForPhase(phase) + 1} van {PHASE_STEPS.length} · {PHASE_SCRIPT[phase].dossierLabel}
            </summary>
            <div className="max-h-[60vh] overflow-y-auto border-t border-border">
              <ModelDossier
                phase={phase}
                projectName={p.name}
                clientCompany={p.client_company}
                sources={sourceList}
                dataset={dataset}
                jobs={jobList}
                runs={runsWithAnalysis}
                industry={industry}
                businessNotes={businessNotes}
                companyDescription={companyDescription}
              />
            </div>
          </details>

          {/* Linkerkant — de chat-motor. */}
          <div className="flex flex-col">
            <p className="mb-2 text-xs font-medium text-accent">{PHASE_SCRIPT[phase].dossierLabel}</p>
            <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface-1">
            <ChatWizard
              projectId={p.id}
              sources={sourceList}
              dataset={dataset}
              jobs={jobList}
              runs={runsWithAnalysis}
              jobConfigs={jobConfigById}
              kpiMargin={p.kpi_margin ?? null}
              industry={industry}
              companyDescription={companyDescription}
              contextProvided={contextProvided}
            />
            </div>
          </div>

          {/* Rechterkant — read-only model-dossier. */}
          <aside className="hidden h-[calc(100dvh-8rem)] overflow-hidden rounded-2xl border border-border bg-surface-2 lg:block">
            <ModelDossier
              phase={phase}
              projectName={p.name}
              clientCompany={p.client_company}
              sources={sourceList}
              dataset={dataset}
              jobs={jobList}
              runs={runsWithAnalysis}
              industry={industry}
              businessNotes={businessNotes}
              companyDescription={companyDescription}
            />
          </aside>
        </div>
      </WizardChatProvider>
    </>
  );
}
