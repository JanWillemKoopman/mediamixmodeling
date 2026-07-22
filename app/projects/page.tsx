import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, LinkButton, PageHeader, StatusBadge, TopBar } from "@/components/ui";
import { NoBuilderAccess } from "@/components/NoAccess";
import { ProjectCreateForm } from "@/components/ProjectCreateForm";
import { getHandleidingMarkdown } from "@/lib/handleiding";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export default async function ProjectsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isBuilder) return <NoBuilderAccess email={viewer.email} />;

  const supabase = createClient();
  const { data } = await supabase
    .schema("mmm")
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  const projects = (data ?? []) as Project[];

  // Lichtgewicht voortgangsindicatie per project ("Stap 5 van 8 · parameter-tuning"): een paar
  // kleine batch-queries over alle projecten heen i.p.v. de volledige pipeline-berekening per
  // project. De nummering volgt exact de 8-staps-wizard (lib/wizard/script.ts PHASE_STEPS),
  // zodat de lijst en de wizard dezelfde stap tonen.
  const TOTAL = 8;
  const ids = projects.map((p) => p.id);
  const [{ data: srcRows }, { data: dsRows }, { data: jobRows }, { data: runRows }, { data: ctxRows }] = ids.length
    ? await Promise.all([
        supabase.schema("mmm").from("source_files").select("project_id, inspection_confirmed_at").in("project_id", ids),
        supabase
          .schema("mmm")
          .from("datasets")
          .select("project_id, status, tuning_confirmed_at, created_at")
          .in("project_id", ids)
          .order("created_at", { ascending: false }),
        supabase
          .schema("mmm")
          .from("jobs")
          .select("project_id, type, status, created_at")
          .in("project_id", ids)
          .in("type", ["fit", "fit_hierarchical"])
          .order("created_at", { ascending: false }),
        supabase.schema("mmm").from("model_runs").select("project_id").in("project_id", ids),
        supabase.schema("mmm").from("project_context").select("project_id, industry, description, notes").in("project_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const inspectionConfirmed = new Set(
    ((srcRows ?? []) as { project_id: string; inspection_confirmed_at: string | null }[])
      .filter((r) => r.inspection_confirmed_at)
      .map((r) => r.project_id),
  );
  const hasSources = new Set((srcRows ?? []).map((r) => r.project_id as string));
  const latestDataset = new Map<string, { status: string; tuning_confirmed_at: string | null }>();
  for (const r of (dsRows ?? []) as { project_id: string; status: string; tuning_confirmed_at: string | null }[]) {
    if (!latestDataset.has(r.project_id)) latestDataset.set(r.project_id, { status: r.status, tuning_confirmed_at: r.tuning_confirmed_at });
  }
  const latestFitStatus = new Map<string, string>();
  for (const r of (jobRows ?? []) as { project_id: string; status: string }[]) {
    if (!latestFitStatus.has(r.project_id)) latestFitStatus.set(r.project_id, r.status);
  }
  const hasRuns = new Set((runRows ?? []).map((r) => r.project_id as string));
  const hasContext = new Set(
    ((ctxRows ?? []) as { project_id: string; industry: string | null; description: string | null; notes: unknown[] | null }[])
      .filter((r) => r.industry || r.description || (Array.isArray(r.notes) && r.notes.length > 0))
      .map((r) => r.project_id),
  );

  function step(n: number, label: string): string {
    return `Stap ${n} van ${TOTAL} · ${label}`;
  }

  function phaseLabel(p: Project): string {
    const fit = latestFitStatus.get(p.id);
    const fitActive = fit === "queued" || fit === "running";
    if (p.status === "published") return step(8, "gepubliceerd");
    if (hasRuns.has(p.id)) return fitActive ? step(7, "nieuwe berekening draait") : step(8, "resultaat beoordelen");
    if (fitActive) return step(7, "berekening draait");
    if (fit === "failed" || fit === "cancelled") return step(7, "berekening mislukt");
    const ds = latestDataset.get(p.id);
    if (ds?.status === "approved") {
      if (ds.tuning_confirmed_at) return step(6, "modelspecificatie");
      if (hasContext.has(p.id) || p.kpi_margin != null) return step(5, "parameter-tuning");
      return step(4, "zakelijke context");
    }
    if (ds?.status === "prepared") return step(3, "dataset goedkeuren");
    if (ds?.status === "preparing") return step(3, "samenvoegen loopt");
    if (ds?.status === "failed") return step(3, "samenvoegen mislukt");
    if (hasSources.has(p.id)) return inspectionConfirmed.has(p.id) ? step(3, "data voorbereiden") : step(2, "data-inspectie");
    return step(1, "data uploaden");
  }

  return (
    <>
      <TopBar email={viewer.email} guideMarkdown={getHandleidingMarkdown()} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Projecten" subtitle="Elk project is één modelbouw voor één klant." />

        <Card>
          <ProjectCreateForm />
        </Card>

        {projects.length === 0 ? (
          <p className="text-sm text-fg-muted">Nog geen projecten. Maak er hierboven één aan.</p>
        ) : (
          <ul className="space-y-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Card className="transition hover:border-border-strong">
                  <div className="flex items-center justify-between gap-4">
                    <Link href={`/projects/${p.id}`} className="min-w-0 flex-1">
                      <p className="font-medium text-fg">{p.name}</p>
                      {p.client_company && (
                        <p className="text-sm text-fg-muted">{p.client_company}</p>
                      )}
                      <p className="mt-1 text-xs text-fg-faint">
                        {phaseLabel(p)}
                        {p.published_at ? ` · laatst gepubliceerd ${dateLabel(p.published_at)}` : ""}
                      </p>
                    </Link>
                    <div className="flex flex-none items-center gap-3">
                      {p.status === "published" && (
                        <LinkButton
                          href={`/dashboard/${p.id}`}
                          target="_blank"
                          variant="secondary"
                          className="text-xs"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Dashboard
                        </LinkButton>
                      )}
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
