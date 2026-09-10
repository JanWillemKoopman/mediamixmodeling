"use client";

// Het transcript. Oudste boven, nieuwste onder — zoals elke chat.
//
// In de oude wizard stond de tekst van de huidige fase juist BOVEN het gesprek
// (components/wizard/ChatWizard.tsx:548 vóór :565), en verdween het gesprek zelf bij een page
// load omdat het React-state was. Hier komt alles uit de database en staat het in de
// volgorde waarin het is gezegd.

import { Bot } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { STEPS } from "@/lib/flow/steps";
import type { TranscriptEntry } from "@/lib/flow/transcript";

function StepSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-medium uppercase tracking-wide text-fg-faint">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function Bubble({ entry }: { entry: TranscriptEntry }) {
  if (entry.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-user px-4 py-2.5 text-sm text-white">
          {entry.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent-dim text-accent">
        <Bot className="h-4 w-4" />
      </div>
      <div className="max-w-[85%] rounded-2xl border border-strong bg-surface px-4 py-2.5 text-sm text-fg">
        <Markdown text={entry.text} />
      </div>
    </div>
  );
}

export function Conversation({ entries }: { entries: TranscriptEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-fg-faint">Het gesprek begint zodra je aan de slag gaat.</p>;
  }

  // Een scheidingsregel bij elke stapwissel, zodat een lang traject terug te lezen blijft:
  // je ziet waar stap 3 ophield en stap 4 begon.
  let previousStep: string | null = entries[0].step;
  return (
    <div className="space-y-4">
      {entries.map((entry, i) => {
        const boundary = i > 0 && entry.step != null && entry.step !== previousStep;
        if (entry.step != null) previousStep = entry.step;
        return (
          <div key={entry.id} className="space-y-4">
            {boundary && entry.step && (
              <StepSeparator label={`${STEPS[entry.step].number}. ${STEPS[entry.step].label}`} />
            )}
            <Bubble entry={entry} />
          </div>
        );
      })}
    </div>
  );
}
