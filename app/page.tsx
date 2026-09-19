import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";

// Leest de ingelogde gebruiker (cookies), dus per request renderen.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Geen content beschikbaar",
  robots: { index: false, follow: false },
};

/**
 * De publieke pagina is tijdelijk leeggehaald: één melding, midden op het scherm.
 * De secties van de marketingsite staan nog in `components/site/` voor als ze terugkomen.
 */
export default async function Home() {
  // Een ingelogde bouwer hoort niet op de lege pagina: door naar de projecten.
  const viewer = await getViewer();
  if (viewer) redirect("/projects");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#D9D9D9] px-6">
      <p className="text-center text-2xl font-medium text-black">Geen content beschikbaar</p>
    </main>
  );
}
