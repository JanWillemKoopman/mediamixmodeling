"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { humanizeError } from "@/lib/humanizeMessage";

export function ProjectCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data: created, error } = await supabase
      .schema("mmm")
      .from("projects")
      .insert({ name, client_company: company || null, created_by: userData.user?.id })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      setError(humanizeError(error.message, "Het project kon niet worden aangemaakt — probeer het opnieuw.").text);
      return;
    }
    setName("");
    setCompany("");
    // Direct de nieuwe wizard in — net als de demo-knop — i.p.v. de bouwer het project in de
    // lijst te laten terugzoeken.
    if (created?.id) {
      router.push(`/projects/${created.id}`);
    } else {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="grow">
        <label className="block text-xs font-medium text-fg-muted">Projectnaam</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Q3-attributie"
          className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
        />
      </div>
      <div className="grow">
        <label className="block text-xs font-medium text-fg-muted">Klant (optioneel)</label>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Acme BV"
          className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent-hover hover:shadow-glow-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Bezig…" : "Project aanmaken"}
      </button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
      <DemoProjectButton />
    </form>
  );
}

// Eén klik naar een gevuld oefenproject: project + demo-CSV (MediaMarkt, 4 jaar weekdata)
// staan klaar alsof je ze zelf had geüpload — ideaal om de wizard te leren kennen of een
// training te starten zonder eerst klantdata te regelen.
function DemoProjectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects/demo", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Demo-project starten mislukt.");
        return;
      }
      router.push(`/projects/${data.project_id}`);
    } catch {
      setError("Verbinding mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full border-t border-border pt-3">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-surface-2 disabled:opacity-50"
      >
        {busy ? "Demo-project wordt klaargezet…" : "Of: start een demo-project (MediaMarkt-oefendata)"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
