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

// Het traject dat de gebruiker doorloopt: van CSV tot begrepen uitkomst.
//
// Zie docs/CHAT_PIPELINE_HERZIENING.md. Dit verving de oude chat-wizard, die zijn
// gespreksverloop in React-state hield (en dus bij elke page load kwijtraakte), keuzes uit
// vrije tekst raadde, en een voortgangsbalk had die een vinkje zette bij stappen die de
// gebruiker had overgeslagen.
//
// Alles wat je hier ziet komt van de server: de toestand uit de feiten plus het grootboek
// (lib/flow/state.ts), het gesprek uit mmm.chat_messages. Er is geen client-state die bij een
// refresh verloren kan gaan.
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
      <TopBar email={viewer.email} guideMarkdown={getHandleidingMarkdown()} logboek />
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
        snapshot={snapshot}
        ledger={ledger}
      />
    </>
  );
}
