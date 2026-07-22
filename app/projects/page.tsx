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

  // Lichtgewicht voortgangsindicatie per project ("Stap 4 van 6 · fit draait"): drie kleine
  // batch-queries over alle projecten heen i.p.v. de volledige pipeline-berekening per
  // project — genoeg om de lijst als dashboard te laten werken.
  const ids = projects.map((p) => p.id);
  const [{ data: srcRows }, { data: dsRows }, { data: jobRows }, { data: runRows }] = ids.length
    ? await Promise.all([
        supabase.schema("mmm").from("source_files").select("project_id").in("project_id", ids),
        supabase
          .schema("mmm")
          .from("datasets")
          .select("project_id, status, created_at")
          .in("project_id", ids)
          .order("created_at", { ascending: false }),
        supabase
          .schema("mmm")
          .from("jobs")
          .select("project_id, type, status")
          .in("project_id", ids)
          .in("type", ["fit", "fit_hierarchical"])
          .in("status", ["queued", "running"]),
        supabase.schema("mmm").from("model_runs").select("project_id").in("project_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const hasSources = new Set((srcRows ?? []).map((r) => r.project_id as string));
  const latestDatasetStatus = new Map<string, string>();
  for (const r of (dsRows ?? []) as { project_id: string; status: string }[]) {
    if (!latestDatasetStatus.has(r.project_id)) latestDatasetStatus.set(r.project_id, r.status);
  }
  const hasActiveFit = new Set((jobRows ?? []).map((r) => r.project_id as string));
  const hasRuns = new Set((runRows ?? []).map((r) => r.project_id as string));

  function phaseLabel(p: Project): string {
    if (p.status === "published") return "Stap 6 van 6 · gepubliceerd";
    if (hasRuns.has(p.id)) return hasActiveFit.has(p.id) ? "Stap 6 van 6 · nieuwe fit draait" : "Stap 6 van 6 · resultaat beoordelen";
    if (hasActiveFit.has(p.id)) return "Stap 5 van 6 · fit draait";
    const ds = latestDatasetStatus.get(p.id);
    if (ds === "approved") return "Stap 4 van 6 · model configureren";
    if (ds === "prepared") return "Stap 3 van 6 · dataset goedkeuren";
    if (ds === "preparing") return "Stap 3 van 6 · samenvoegen loopt";
    if (ds === "failed") return "Stap 3 van 6 · samenvoegen mislukt";
    if (hasSources.has(p.id)) return p.eda_completed_at ? "Stap 3 van 6 · data voorbereiden" : "Stap 2 van 6 · data verkennen";
    return "Stap 1 van 6 · data uploaden";
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
