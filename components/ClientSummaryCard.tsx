import type { ClientSummary } from "@/lib/types";
import { Markdown } from "@/components/Markdown";

// De door de adviseur gegenereerde samenvatting in klanttaal (model_runs.client_summary).
// Deze werd wel geproduceerd maar nog nergens aan de klant getoond — hij hoort bovenaan het
// dashboard als leesbare context bij alle cijfers die eronder volgen. Bewust open (geen
// details-inklap): dit is het verhaal, niet een voetnoot.
export function ClientSummaryCard({ summary }: { summary: ClientSummary }) {
  if (!summary.text.trim()) return null;
  return (
    <section className="print-avoid-break rounded-xl border border-border-strong bg-surface-2/60 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-faint">Samenvatting</h2>
      <Markdown text={summary.text} className="mt-2 text-sm leading-relaxed text-fg" />
    </section>
  );
}
