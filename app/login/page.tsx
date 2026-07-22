"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { humanizeAuthError } from "@/lib/humanizeMessage";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [magicBusy, setMagicBusy] = useState(false);

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const base = humanizeAuthError(error.message);
      // Veel accounts hebben (nog) geen wachtwoord ingesteld — wijs de gebruiker actief naar
      // de magische link i.p.v. ze te laten vastlopen op een wachtwoordfout.
      setError(`${base} Geen wachtwoord ingesteld? Gebruik hieronder de magische inloglink.`);
      return;
    }
    router.push("/projects");
    router.refresh();
  }

  async function onMagicLink() {
    if (!email) {
      setError("Vul eerst je e-mailadres in.");
      return;
    }
    setMagicBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setMagicBusy(false);
    if (error) {
      setError(humanizeAuthError(error.message));
      return;
    }
    setMagicSent(true);
  }

  if (magicSent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Check je mail</h1>
        <p className="mt-2 text-sm text-fg-muted">
          We hebben een inloglink gestuurd naar <span className="font-medium">{email}</span>. Klik
          erop om in te loggen.
        </p>
        <button
          onClick={() => setMagicSent(false)}
          className="mt-6 text-sm text-fg-muted underline hover:text-fg"
        >
          Terug
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold lowercase tracking-tight text-brand-700">media mix modeling</h1>
      <p className="mt-1 text-sm text-fg-muted">Log in om verder te gaan.</p>

      <form onSubmit={onPasswordSubmit} className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium text-fg">E-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-fg outline-none transition focus:border-accent/50 focus:shadow-glow-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-fg">Wachtwoord</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-fg outline-none transition focus:border-accent/50 focus:shadow-glow-sm"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-bg transition hover:bg-accent-hover hover:shadow-glow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Bezig…" : "Inloggen"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-fg-faint">
        <span className="h-px grow bg-surface-3" />
        of
        <span className="h-px grow bg-surface-3" />
      </div>

      <button
        onClick={onMagicLink}
        disabled={magicBusy}
        className="w-full rounded-full border border-border-strong px-4 py-2.5 text-sm font-medium text-fg transition hover:bg-surface-2 disabled:opacity-50"
      >
        {magicBusy ? "Versturen…" : "Stuur mij een magische inloglink"}
      </button>
      <p className="mt-2 text-xs text-fg-faint">
        Geen wachtwoord ingesteld? Gebruik de magische link — we mailen je een inloglink.
      </p>
    </main>
  );
}
