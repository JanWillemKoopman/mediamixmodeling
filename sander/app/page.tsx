export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Sander</h1>
      <p className="text-neutral-600">
        Losstaande app binnen de news-repo. Zie <code>sander/README.md</code> voor setup
        (eigen Supabase-schema, eigen npm-project, geen gedeelde code met mmm-wizard).
      </p>
    </main>
  );
}
