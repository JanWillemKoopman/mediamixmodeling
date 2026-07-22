import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AnalysisView } from "@/components/AnalysisView";
import { HierarchicalSummaryView } from "@/components/HierarchicalSummaryView";
import { PageHeader, TopBar } from "@/components/ui";
import { SummaryView } from "@/components/SummaryView";
import { ScenarioPlanner } from "@/components/ScenarioPlanner";
import { DashboardTabs } from "@/components/DashboardTabs";
import { ClientSummaryCard } from "@/components/ClientSummaryCard";
import { DashboardHelp } from "@/components/DashboardHelp";
import { PrintButton } from "@/components/PrintButton";
import { isHierSummary, type JobConfig, type ModelRun, type Project } from "@/lib/types";

// "Laatst bijgewerkt" in leesbare NL-datum voor het versheidsstempel.
function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export const dynamic = "force-dynamic";

// The client-facing dashboard: only published results of a project the viewer was granted.
// RLS guarantees this even if the id is guessed — a non-permitted project returns nothing.
export default async function ClientDashboard({ params }: { params: { projectId: string } }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const supabase = createClient();
  const { data: project } = await supabase
    .schema("mmm")
    .from("projects")
    .select("*")
    .eq("id", params.projectId)
    .maybeSingle();
  if (!project) notFound();
  const p = project as Project;

  const { data: runs } = await supabase
    .schema("mmm")
    .from("model_runs")
    .select("*")
    .eq("project_id", p.id)
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(1);
  const latest = (runs ?? [])[0] as ModelRun | undefined;

  // Telling-KPI (orders/leads) vs. continue KPI (omzet) voor de marge-woordkeuze in het
  // dashboard ("per verkochte eenheid" vs. "per euro omzet") — uit de config waarmee
  // deze run is gefit; onbekend (geen job_id, of oudere run) = neutrale tekst.
  let isCountKpi: boolean | undefined;
  if (latest?.job_id) {
    const { data: job } = await supabase
      .schema("mmm")
      .from("jobs")
      .select("config")
      .eq("id", latest.job_id)
      .maybeSingle();
    const likelihood = (job?.config as JobConfig | undefined)?.model?.likelihood;
    if (likelihood) isCountKpi = likelihood === "poisson" || likelihood === "negative_binomial";
  }

  return (
    <>
      <TopBar email={viewer.email} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title={p.name}
          subtitle={p.client_company ?? "Media mix model — resultaten"}
          action={latest ? <PrintButton /> : undefined}
        />
        {latest && (
          // Versheidsstempel: waar de cijfers op gebaseerd zijn en wanneer ze zijn bijgewerkt —
          // een basaal vertrouwenssignaal bij besluiten met grote budgetten.
          <p className="-mt-3 text-xs text-fg-faint">
            {isHierSummary(latest.summary)
              ? `Datavenster ${latest.summary.n_weeks} weken`
              : `Datavenster ${latest.summary.window[0]} t/m ${latest.summary.window[1]} (${latest.summary.n_weeks} weken)`}
            {fmtDate(latest.published_at) && ` · Laatst bijgewerkt ${fmtDate(latest.published_at)}`}
          </p>
        )}
        {latest ? (
          isHierSummary(latest.summary) ? (
            // Hiërarchische run: geen responscurves, dus geen scenario-tabblad.
            <DashboardTabs
              results={
                <>
                  {latest.client_summary && <ClientSummaryCard summary={latest.client_summary} />}
                  <DashboardHelp />
                  <HierarchicalSummaryView summary={latest.summary} />
                </>
              }
              scenario={null}
            />
          ) : (
            <DashboardTabs
              results={
                <>
                  {latest.client_summary && <ClientSummaryCard summary={latest.client_summary} />}
                  <DashboardHelp />
                  <SummaryView summary={latest.summary} kpiMargin={p.kpi_margin ?? null} isCountKpi={isCountKpi} />
                  {latest.analysis && <AnalysisView analysis={latest.analysis} />}
                </>
              }
              scenario={
                latest.summary.response_curves && latest.summary.response_curves.length > 0 ? (
                  <ScenarioPlanner summary={latest.summary} kpiMargin={p.kpi_margin ?? null} />
                ) : null
              }
            />
          )
        ) : (
          <p className="text-sm text-fg-muted">
            Er is nog geen gepubliceerd resultaat voor dit project.
          </p>
        )}
        <p className="text-xs text-fg-faint">
          Elke waarde toont de mediaan met een 94%-betrouwbaarheidsinterval. Brede marges bij
          data-arme kanalen zijn een eerlijke weergave van onzekerheid, geen fout.
        </p>
      </main>
    </>
  );
}
