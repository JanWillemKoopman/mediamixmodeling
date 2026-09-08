import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withJsonErrors } from "@/lib/apiRoute";

// Demo-aanvragen van de publieke one-page. Geen auth: de bezoeker is per definitie niet
// ingelogd. De route valideert zelf (lengtes, e-mailvorm) en laat RLS het overige werk
// doen — insert mag iedereen, lezen alleen een builder (0021_demo_requests.sql).

const MAX = { name: 120, email: 160, company: 160, role: 120, budget: 80, message: 2000 };

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function handlePost(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "We konden je aanvraag niet lezen. Probeer het opnieuw." }, { status: 400 });
  }

  // Honeypot: alleen bots vullen dit veld in. Geef ze een gewone bevestiging terug in
  // plaats van een foutmelding, dan leren ze niets van de poging.
  if (clean(body.website, 200)) {
    return NextResponse.json({ ok: true });
  }

  const name = clean(body.name, MAX.name);
  const email = clean(body.email, MAX.email);
  const company = clean(body.company, MAX.company);

  if (!name || !company) {
    return NextResponse.json({ error: "Vul je naam en bedrijf in, dan weten we wie we terugmailen." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Dit e-mailadres lijkt niet te kloppen. Controleer het even." }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase
    .schema("mmm")
    .from("demo_requests")
    .insert({
      name,
      email,
      company,
      role: clean(body.role, MAX.role) || null,
      budget: clean(body.budget, MAX.budget) || null,
      message: clean(body.message, MAX.message) || null,
    });

  if (error) {
    console.error("[api] demo-request opslaan mislukt:", error);
    return NextResponse.json(
      { error: "We konden je aanvraag niet opslaan. Probeer het zo nog eens." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export const POST = withJsonErrors(handlePost);
