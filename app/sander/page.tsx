export default function SanderPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Sander</h1>
      <p className="text-fg/70">
        Eigen route binnen mmm-wizard, met een eigen Supabase-schema (<code>sander</code>).
        Deelt deployment, Next.js-config en auth met de rest van deze app, maar niet de
        data — zie <code>lib/sander/supabase/</code> en{" "}
        <code>supabase/migrations/0020_sander_schema.sql</code>.
      </p>
    </main>
  );
}
