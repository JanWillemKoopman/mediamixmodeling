import { NextResponse } from "next/server";

// Every API route is wrapped in this guard so the client ALWAYS receives valid JSON —
// also on bugs we didn't anticipate. Without it, an uncaught throw surfaces as Next.js'
// plain-text 500 page, which the frontend then fails to parse ("Unexpected token 'A',
// \"An error o\"... is not valid JSON"). The real error goes to the server log; the user
// gets a clean, generic Dutch message.
type RouteHandler<Ctx> = (request: Request, context: Ctx) => Promise<Response> | Response;

export function withJsonErrors<Ctx = unknown>(handler: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (err) {
      console.error(`[api] unhandled error in ${new URL(request.url).pathname}:`, err);
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
