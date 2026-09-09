import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { loadProjectSnapshot } from "@/lib/snapshot";
import { TopBar } from "@/components/ui";
import { NoBuilderAccess } from "@/components/NoAccess";
import { ChatWizard } from "@/components/wizard/ChatWizard";
import { ModelDossier } from "@/components/wizard/ModelDossier";
import { WizardChatProvider } from "@/components/WizardChatContext";
import { derivePhase } from "@/lib/wizard/phase";
import { PHASE_SCRIPT, PHASE_STEPS, stepIndexForPhase } from "@/lib/wizard/script";
import { getHandleidingMarkdown } from "@/lib/handleiding";

export const dynamic = "force-dynamic";

// The chat-driven wizard: one continuous conversation on the left that walks the builder
// through the whole MMM process, with a read-only dossier on the right showing progress and
// everything that has been established.
//
// The page assembles the project snapshot once (see lib/snapshot.ts) rather than handing the
// wizard five parallel arrays to re-join. That is not only tidier: it makes it impossible
// for a component to hold a result without the verdict that governs what may be shown.
export default async function ProjectDetail({ params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isBuilder) return <NoBuilderAccess email={viewer.email} />;

  const snapshot = await loadProjectSnapshot(params.id);
  if (!snapshot) notFound();

  const { project, context } = snapshot;
  const contextProvided =
    Boolean(context?.industry) ||
    Boolean(context?.description) ||
    (context?.notes ?? []).length > 0 ||
    project.kpi_margin != null;

  const phase = derivePhase({
    sources: snapshot.sources,
    dataset: snapshot.dataset,
    configuration: snapshot.configuration,
    runs: snapshot.runs,
    contextProvided,
  });

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
          {/* Mobile/tablet: the dossier is hidden next to the chat below lg, so it appears
              here as a collapsible panel above it. "Where am I?" has to be answerable
              without opening it, so the summary line always shows the current step. */}
          <details className="mb-3 rounded-2xl border border-border bg-surface-2 lg:hidden">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fg">
              Stap {stepIndexForPhase(phase) + 1} van {PHASE_STEPS.length} · {PHASE_SCRIPT[phase].dossierLabel}
            </summary>
            <div className="max-h-[60vh] overflow-y-auto border-t border-border">
              <ModelDossier phase={phase} snapshot={snapshot} />
            </div>
          </details>

          <div className="flex flex-col">
            <p className="mb-2 text-xs font-medium text-accent">{PHASE_SCRIPT[phase].dossierLabel}</p>
            <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface-1">
              <ChatWizard snapshot={snapshot} contextProvided={contextProvided} />
            </div>
          </div>

          <aside className="hidden h-[calc(100dvh-8rem)] overflow-hidden rounded-2xl border border-border bg-surface-2 lg:block">
            <ModelDossier phase={phase} snapshot={snapshot} />
          </aside>
        </div>
      </WizardChatProvider>
    </>
  );
}
