import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NoBuilderAccess } from "@/components/NoAccess";
import { PageHeader, TopBar } from "@/components/ui";
import { LogViewer, type LogRow } from "@/components/LogViewer";

/**
 * Het logboek van een testronde.
 *
 * Dit scherm bestaat voor één moment: je loopt de app door, er gaat iets mis, en je wil dat
 * kunnen doorgeven zonder te weten wat een console is. Eén knop levert de tekst waar Claude
 * Code mee verder kan.
 */

export const dynamic = "force-dynamic";

const LIMIT = 500;

export default async function LogboekPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isBuilder) return <NoBuilderAccess email={viewer.email} />;

  const supabase = createClient();
  const { data, error } = await supabase
    .schema("mmm")
    .from("app_events")
    .select("id, at, session_id, source, level, event, message, project_id, path, detail")
    .order("at", { ascending: false })
    .limit(LIMIT);

  const rows = (data ?? []) as LogRow[];
  const problems = rows.filter((r) => r.level !== "info").length;

  return (
    <>
      <TopBar email={viewer.email} logboek />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <PageHeader
          title="Logboek"
          subtitle={
            error
              ? "Het logboek kon niet worden gelezen — is migratie 0025 al uitgevoerd?"
              : `De laatste ${rows.length} gebeurtenissen, waarvan ${problems} fouten of waarschuwingen. Nieuwste bovenaan.`
          }
        />

        <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-fg-muted">
          <p className="font-medium text-fg">Loop je ergens tegenaan?</p>
          <p className="mt-1">
            Klik op <span className="font-medium">Kopieer voor Claude</span>, plak het in Claude Code
            en schrijf erbij wat je probeerde te doen. In het logboek staat wat je aanklikte, wat de
            server antwoordde en welke fout er precies optrad — genoeg om het op te lossen zonder dat
            je het zelf hoeft uit te leggen.
          </p>
        </div>

        {error ? (
          <p className="rounded-xl border border-danger/30 bg-danger-dim px-4 py-3 text-sm text-danger">
            {error.message}
          </p>
        ) : (
          <LogViewer rows={rows} />
        )}
      </main>
    </>
  );
}
