import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { loadProjectSnapshot } from "@/lib/snapshot";
import { loadLedger } from "@/lib/flow/ledger";
import { loadTranscript } from "@/lib/flow/transcript";
import { deriveFlowState } from "@/lib/flow/state";
import { TopBar } from "@/components/ui";
import { NoBuilderAccess } from "@/components/NoAccess";
import { FlowShell } from "@/components/flow/FlowShell";
import { getHandleidingMarkdown } from "@/lib/handleiding";

export const dynamic = "force-dynamic";

// Het nieuwe traject (fase 1 van docs/CHAT_PIPELINE_HERZIENING.md).
//
// Staat bewust náást de bestaande wizard op /projects/[id] in plaats van hem te vervangen:
// tot fase 3 klaar is, blijft die gewoon werken. Wat hier al staat is het skelet — de
// stappenbalk, het permanente transcript en het kaart-raamwerk. De stappen zelf worden in
// fase 2 tot 4 ingevuld; een handeling die nog niet gebouwd is, zegt dat.
//
// Alles wat je ziet komt van de server: de toestand uit de feiten plus het grootboek, het
// gesprek uit mmm.chat_messages. Er is geen client-state die bij een refresh verloren kan gaan.
export default async function ProjectFlow({ params }: { params: { id: string } }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isBuilder) return <NoBuilderAccess email={viewer.email} />;

  const snapshot = await loadProjectSnapshot(params.id);
  if (!snapshot) notFound();

  const [ledger, transcript] = await Promise.all([
    loadLedger(params.id),
    loadTranscript(params.id),
  ]);
  const state = deriveFlowState(snapshot, ledger);

  return (
    <>
      <TopBar email={viewer.email} guideMarkdown={getHandleidingMarkdown()} />
      <div className="mx-auto max-w-[1400px] px-4 pt-4 sm:px-6">
        <Link href="/projects" className="text-sm text-fg-muted transition hover:text-fg">
          ← Projecten
        </Link>
      </div>
      <FlowShell
        projectId={params.id}
        projectName={snapshot.project.name}
        state={state}
        transcript={transcript}
        source={snapshot.sources[0] ?? null}
        dataset={snapshot.dataset}
      />
    </>
  );
}
