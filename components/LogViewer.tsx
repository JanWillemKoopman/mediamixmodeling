"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Download } from "lucide-react";
import type { LogLevel } from "@/lib/log/events";

export interface LogRow {
  id: number;
  at: string;
  session_id: string;
  source: "client" | "server";
  level: LogLevel;
  event: string;
  message: string | null;
  project_id: string | null;
  path: string | null;
  detail: Record<string, unknown>;
}

// De leesbare kant van het logboek. Bewust géén dashboard met grafieken: dit scherm heeft
// precies één taak, namelijk dat wat er misging in één handeling bij Claude Code terechtkomt.
// Vandaar dat de kopieerknop bovenaan staat en niet ergens onderin.

const LEVEL_TONE: Record<LogLevel, string> = {
  error: "border-danger/30 bg-danger-dim text-danger",
  warn: "border-warn/30 bg-warn-dim text-warn",
  info: "border-border bg-surface-2 text-fg-muted",
};

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

/** De platte tekst die je in Claude Code plakt. Nieuwste onderaan — zo lees je het als verhaal. */
function asPlainText(rows: LogRow[]): string {
  const lines = [...rows]
    .reverse()
    .map((r) => {
      const head = `${dayLabel(r.at)} ${timeLabel(r.at)} [${r.level}] ${r.source} ${r.event}`;
      const where = r.path ? ` (${r.path})` : "";
      const what = r.message ? `\n    ${r.message}` : "";
      const extra =
        Object.keys(r.detail ?? {}).length > 0 ? `\n    detail: ${JSON.stringify(r.detail)}` : "";
      return `${head}${where}${what}${extra}`;
    });
  return [
    "# Logboek media mix modeling",
    `# ${rows.length} gebeurtenissen, oudste eerst`,
    "",
    ...lines,
  ].join("\n");
}

export function LogViewer({ rows }: { rows: LogRow[] }) {
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [session, setSession] = useState<string>("alle");
  const [open, setOpen] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const sessions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.session_id)) seen.set(r.session_id, r.at);
    return [...seen.entries()];
  }, [rows]);

  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (session === "alle" || r.session_id === session) &&
          (!onlyProblems || r.level !== "info"),
      ),
    [rows, session, onlyProblems],
  );

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(asPlainText(shown));
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Klembord geweigerd (kan in sommige browsers zonder https). Dan blijft downloaden over.
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(shown, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logboek-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent-hover"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Gekopieerd — plak het in Claude Code" : `Kopieer ${shown.length} regels voor Claude`}
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm text-fg transition hover:bg-surface-2"
        >
          <Download className="h-4 w-4" /> Download als bestand
        </button>

        <label className="ml-auto inline-flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(e) => setOnlyProblems(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Alleen fouten en waarschuwingen
        </label>

        <select
          value={session}
          onChange={(e) => setSession(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg"
        >
          <option value="alle">Alle testsessies</option>
          {sessions.map(([id, at]) => (
            <option key={id} value={id}>
              {id} · {dayLabel(at)} {timeLabel(at)}
            </option>
          ))}
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-2 px-4 py-8 text-center text-sm text-fg-muted">
          {onlyProblems
            ? "Geen fouten in deze selectie. Zet het vinkje uit om ook te zien wat je deed."
            : "Nog niets vastgelegd. Loop een stuk van de app door en ververs deze pagina."}
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-1">
          {shown.map((r) => (
            <div key={r.id} className="px-3 py-2 text-sm">
              <button
                type="button"
                onClick={() => setOpen(open === r.id ? null : r.id)}
                className="flex w-full items-start gap-3 text-left"
              >
                <span className="mt-0.5 flex-none font-mono text-xs text-fg-faint">{timeLabel(r.at)}</span>
                <span
                  className={`mt-0.5 flex-none rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${LEVEL_TONE[r.level]}`}
                >
                  {r.level}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-fg">{r.event}</span>
                  {r.message && <span className="ml-2 text-fg-muted">{r.message}</span>}
                  {r.path && <span className="ml-2 font-mono text-xs text-fg-faint">{r.path}</span>}
                </span>
                <ChevronDown
                  className={`mt-0.5 h-4 w-4 flex-none text-fg-faint transition ${open === r.id ? "rotate-180" : ""}`}
                />
              </button>
              {open === r.id && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs text-fg-muted">
                  {JSON.stringify({ sessie: r.session_id, kant: r.source, project: r.project_id, ...r.detail }, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
