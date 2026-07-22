"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

// Route-segment error boundary: een onverwachte render- of datafout in eender welke
// pagina eindigt hier — in een nette melding met herstelknop — in plaats van in een
// wit scherm of bevroren UI.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[boundary]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-dim text-danger">
        <AlertCircle className="h-6 w-6" />
      </span>
      <h1 className="text-lg font-semibold text-fg">Er ging onverwacht iets mis</h1>
      <p className="text-sm text-fg-muted">
        Je werk is niet verloren — uploads, datasets en modelruns staan veilig opgeslagen. Probeer het
        opnieuw; blijft deze melding terugkomen, ververs dan de pagina.
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent-hover"
      >
        <RotateCcw className="h-4 w-4" />
        Opnieuw proberen
      </button>
      {error.digest && <p className="text-xs text-fg-faint">Foutcode: {error.digest}</p>}
    </main>
  );
}
