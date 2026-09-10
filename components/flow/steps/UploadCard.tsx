"use client";

// Stap 2 — data aanleveren.
//
// Twee dingen die de oude wizard niet deed: de eisen staan er vóórdat je uploadt (met een
// sjabloon dat er al aan voldoet), en het oordeel komt meteen na het uploaden in plaats van
// twee stappen later als het samenvoegen struikelt.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Info, Paperclip } from "lucide-react";
import { uploadSourceFile } from "@/lib/flow/upload";
import { checkSource } from "@/lib/flow/dataCheck";
import type { SourceFile } from "@/lib/types";

const TEMPLATE = [
  "week,omzet,tv,social,search,prijs",
  "2025-01-06,124500,8000,2200,3100,19.95",
  "2025-01-13,131200,8000,2400,3050,19.95",
  "2025-01-20,118900,0,2100,2980,21.50",
].join("\n");

function downloadTemplate() {
  const blob = new Blob([`${TEMPLATE}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "voorbeeld-mediadata.csv";
  link.click();
  URL.revokeObjectURL(url);
}

const TONE_ICON = {
  ok: <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-success" />,
  warn: <Info className="mt-0.5 h-3.5 w-3.5 flex-none text-warn" />,
  blocking: <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-danger" />,
};

export function UploadCard({
  projectId,
  source,
  localSignal,
  onChanged,
}: {
  projectId: string;
  source: SourceFile | null;
  /** Welke lokale actie zojuist is aangeklikt (id + teller, zodat herhalen ook aankomt). */
  localSignal: { actionId: string; n: number } | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!localSignal) return;
    if (localSignal.actionId === "data.upload") inputRef.current?.click();
    if (localSignal.actionId === "data.template") downloadTemplate();
  }, [localSignal]);

  async function upload(files: FileList | File[]) {
    setBusy(true);
    setError(null);
    const { error: uploadError } = await uploadSourceFile(projectId, files);
    setBusy(false);
    if (uploadError) {
      setError(uploadError);
      return;
    }
    onChanged();
  }

  if (source) {
    const check = checkSource(source.profile);
    const tone =
      check.verdict === "not_usable"
        ? "border-danger/30 bg-danger-dim"
        : check.verdict === "usable_with_warnings"
          ? "border-warn/30 bg-warn-dim"
          : "border-success/30 bg-success-dim";
    return (
      <div className={`rounded-xl border p-4 ${tone}`}>
        <p className="text-sm font-medium text-fg">{check.headline}</p>
        <p className="mt-0.5 text-xs text-fg-muted">{source.name}</p>
        <ul className="mt-2.5 space-y-1.5">
          {check.points.map((point, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-fg">
              {TONE_ICON[point.tone]}
              <span>{point.text}</span>
            </li>
          ))}
        </ul>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
        {busy && <p className="mt-2 text-xs text-fg-faint">Bezig met uploaden…</p>}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files);
      }}
      className={`rounded-xl border-2 border-dashed p-5 text-center transition ${
        dragOver ? "border-accent/50 bg-accent-dim" : "border-border"
      }`}
    >
      <Paperclip className="mx-auto h-5 w-5 text-fg-faint" />
      <p className="mt-2 text-sm text-fg">Sleep je CSV hierheen, of kies hieronder een bestand.</p>
      <p className="mt-1 text-xs text-fg-faint">CSV of Excel, maximaal 50 MB.</p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files);
          e.target.value = "";
        }}
      />
      {busy && <p className="mt-2 text-xs text-fg-faint">Bezig met uploaden…</p>}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
