import { NextResponse } from "next/server";
import { logServerError, logServerEvent } from "@/lib/log/server";

// Every API route is wrapped in this guard so the client ALWAYS receives valid JSON —
// also on bugs we didn't anticipate. Without it, an uncaught throw surfaces as Next.js'
// plain-text 500 page, which the frontend then fails to parse ("Unexpected token 'A',
// \"An error o\"... is not valid JSON"). The real error goes to the server log; the user
// gets a clean, generic Dutch message.
type RouteHandler<Ctx> = (request: Request, context: Ctx) => Promise<Response> | Response;

// Een mislukte Claude-call mag geen rauwe, vaak Engelstalige SDK-tekst aan een
// Nederlandstalige gebruiker tonen. Log de echte fout server-side en geef één nette,
// begrijpelijke boodschap terug. Gebruikt door alle AI-routes (chat, analyse,
// klantsamenvatting, inspectie, auto-verfijn, kolomherkenning).
export function claudeErrorMessage(err: unknown, request?: Request): string {
  console.error("[api] Claude API-fout:", err);
  // Ook in het logboek: dit is de fout waar de gebruiker "de AI doet het niet" over meldt,
  // en de enige plek waar staat wát de AI dan precies antwoordde.
  void logServerError(request, "claude.mislukt", err);
  return (
    "De AI-assistent is nu even niet bereikbaar. Probeer het zo opnieuw. " +
    "Blijft het misgaan, controleer dan of de AI-sleutel (ANTHROPIC_API_KEY) is ingesteld."
  );
}

export function withJsonErrors<Ctx = unknown>(handler: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return async (request, context) => {
    const started = Date.now();
    try {
      const response = await handler(request, context);
      // Een geweigerd verzoek (4xx) is geen crash, maar wel bijna altijd het antwoord op
      // "waarom kon ik niet verder?" — dus hoort het in het logboek. Geslaagde verzoeken
      // niet: die staan al als handeling aan de browserkant, en zouden het logboek vullen
      // met ruis waar niemand doorheen kijkt.
      if (!response.ok) {
        void logServerEvent({
          request,
          level: "warn",
          event: "api.geweigerd",
          message: `${request.method} ${new URL(request.url).pathname} → ${response.status}`,
          detail: { status: response.status, ms: Date.now() - started },
        });
      }
      return response;
    } catch (err) {
      console.error(`[api] unhandled error in ${new URL(request.url).pathname}:`, err);
      void logServerError(request, "api.crash", err, {
        methode: request.method,
        ms: Date.now() - started,
      });
      return NextResponse.json(
        {
          error:
            "Er ging onverwacht iets mis aan de serverkant. Probeer het opnieuw; blijft het misgaan, ververs dan de pagina.",
        },
        { status: 500 },
      );
    }
  };
}
