export function NoBuilderAccess({ email }: { email: string | null }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Geen toegang</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Je bent ingelogd als <span className="font-medium">{email}</span>, maar dit account is
        geen builder. Vraag een beheerder om je toe te voegen aan <code>mmm.app_users</code> met{" "}
        <code>is_builder = true</code>.
      </p>
      <form action="/auth/signout" method="post" className="mt-6">
        <button className="rounded-lg border border-border-strong px-4 py-2 text-sm text-fg transition hover:bg-surface-2">
          Uitloggen
        </button>
      </form>
    </main>
  );
}
