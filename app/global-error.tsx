"use client";

// Laatste vangnet: vangt fouten in de root-layout zelf, waar app/error.tsx niet meer
// kan renderen. Moet zijn eigen <html>/<body> leveren en kan niet op globals.css
// rekenen, dus bewust simpele inline styling.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="nl">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          background: "#F7F3EA",
          color: "#1E3932",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Er ging onverwacht iets mis</h1>
          <p style={{ fontSize: 14, color: "#4C5F57", lineHeight: 1.6 }}>
            Je gegevens staan veilig opgeslagen. Probeer het opnieuw of ververs de pagina.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "10px 20px",
              borderRadius: 9999,
              border: "none",
              background: "#00754A",
              color: "#FDFBF6",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Opnieuw proberen
          </button>
          {error.digest && <p style={{ fontSize: 12, color: "#8A9891" }}>Foutcode: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
