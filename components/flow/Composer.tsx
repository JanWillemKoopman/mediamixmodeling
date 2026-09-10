"use client";

// Vrij typen: een vraag aan de gids.
//
// Dit ontbrak in de eerste opzet van de nieuwe flow, en dat was een echt gat: de chat was de
// spine van het verhaal, maar er was geen invoerveld. Een gebruiker die "waarom is tv zo
// onzeker?" wil vragen, kon dat niet.
//
// Het is bewust een tweede pad náást de knoppen, niet het enige pad. Keuzes gaan via knoppen
// (die kunnen niet verkeerd gelezen worden); vragen gaan hierlangs.

import { useRef, useState } from "react";
import { Send } from "lucide-react";

export function Composer({
  onAsk,
  busy,
  placeholder = "Stel een vraag over deze stap…",
}: {
  onAsk: (question: string) => void;
  busy: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const question = value.trim();
    if (!question || busy) return;
    setValue("");
    onAsk(question);
  }

  return (
    <div className="flex items-end gap-2 border-t border-border px-4 py-3 sm:px-6">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder={placeholder}
        className="flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none transition focus:border-strong"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim() || busy}
        aria-label="Vraag versturen"
        className="rounded-lg bg-accent p-2 text-bg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-fg-faint"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}
