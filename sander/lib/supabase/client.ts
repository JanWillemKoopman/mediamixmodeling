"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (publishable key). Deze app is volledig losstaand van
// mmm-wizard: alle tabellen leven in het `sander`-schema, niet in `mmm`. Auth (users,
// sessions) blijft gedeeld op het default `auth`-schema van hetzelfde Supabase-project.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { db: { schema: "sander" } },
  );
}
