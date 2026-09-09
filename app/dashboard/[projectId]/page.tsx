import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AnalysisView } from "@/components/AnalysisView";
import { PageHeader, TopBar } from "@/components/ui";
import { SummaryView } from "@/components/SummaryView";
import { ScenarioPlanner } from "@/components/ScenarioPlanner";
import { DashboardTabs } from "@/components/DashboardTabs";
import { ClientSummaryCard } from "@/components/ClientSummaryCard";
import { DashboardHelp } from "@/components/DashboardHelp";
import { PrintButton } from "@/components/PrintButton";
import { allows, type ModelResult, type ModelValidation, type Project } from "@/lib/types";

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export const dynamic = "force-dynamic";

// The client-facing dashboard: only the published result of a project the viewer was granted.
// Row-level security guarantees that even if the id is guessed.
//
// The verdict comes with the result and is rendered above it. In v1 the client saw the
// numbers and a budget recommendation with no indication of how much to trust either — and
// nothing stopped a run that had failed its own quality gate from being published in the
// first place. Both ends of that are now closed: `mmm.publish_run()` refuses a run below the
// bar, and what does get published carries its verdict onto this page.
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
  const p = project as unknown as Project;

  const { data: results } = await supabase
    .schema("mmm")
    .from("model_results")
    .select("*")
    .eq("project_id", p.id)
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(1);
  const latest = ((results ?? []) as unknown as ModelResult[])[0];

  let validation: ModelValidation | null = null;
  if (latest) {
    const { data } = await supabase
      .schema("mmm")
      .from("model_validations")
      .select("*")
      .eq("model_run_id", latest.model_run_id)
      .maybeSingle();
    validation = (data as unknown as ModelValidation) ?? null;
  }

  const summary = latest?.summary ?? null;
  const canPlan =
    summary != null &&
    allows(validation, "budget_advice") &&
    (summary.response_curves?.length ?? 0) > 0;

  return (
    <>
      <TopBar email={viewer.email} homeHref={`/dashboard/${p.id}`} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title={p.name}
          subtitle={p.client_company ?? "Media mix model — resultaten"}
          action={latest ? <PrintButton /> : undefined}
        />
        {summary && (
          <p className="-mt-3 text-xs text-fg-faint">
            Datavenster {summary.window[0]} t/m {summary.window[1]} ({summary.n_weeks} weken)
            {summary.weekly?.burn_in_weeks
              ? `; de eerste ${summary.weekly.burn_in_weeks} weken bouwden alleen de na-ijl op`
              : ""}
            {fmtDate(latest?.published_at ?? null) && ` · Laatst bijgewerkt ${fmtDate(latest!.published_at)}`}
          </p>
        )}
        {latest && summary ? (
          <DashboardTabs
            results={
              <>
                {latest.client_summary && <ClientSummaryCard summary={latest.client_summary} />}
                <DashboardHelp />
                <SummaryView summary={summary} validation={validation} kpiMargin={p.kpi_margin ?? null} />
                {latest.analysis && <AnalysisView analysis={latest.analysis} />}
              </>
            }
            scenario={canPlan ? <ScenarioPlanner summary={summary} kpiMargin={p.kpi_margin ?? null} /> : null}
          />
        ) : (
          <p className="text-sm text-fg-muted">Er is nog geen gepubliceerd resultaat voor dit project.</p>
        )}
        <p className="text-xs text-fg-faint">
          Elke waarde toont de mediaan met een 94%-betrouwbaarheidsinterval. Brede marges bij
          data-arme kanalen zijn een eerlijke weergave van onzekerheid, geen fout.
        </p>
      </main>
    </>
  );
}
