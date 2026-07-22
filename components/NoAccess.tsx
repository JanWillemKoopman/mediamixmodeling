const CONTACT_EMAIL = "koopman.janwillem@gmail.com";

export function NoBuilderAccess({ email }: { email: string | null }) {
  const subject = encodeURIComponent("Toegang tot de MMM-wizard");
  const body = encodeURIComponent(
    `Hoi,\n\nIk zou graag toegang krijgen tot de MMM-wizard.\nMijn account: ${email ?? ""}\n\nAlvast bedankt!`,
  );
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Nog geen toegang</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Je bent ingelogd als <span className="font-medium">{email}</span>. Dit account mag nog geen
        modellen bouwen. Vraag toegang aan bij de beheerder — dan zetten we je account klaar.
      </p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent-hover"
        >
          Vraag toegang aan
        </a>
        <form action="/auth/signout" method="post">
          <button className="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg transition hover:bg-surface-2">
            Uitloggen
          </button>
        </form>
      </div>
    </main>
  );
}
