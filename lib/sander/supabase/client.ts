"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client voor de sander-app. Zelfde Supabase-project/deployment
// als mmm-wizard, maar sander-tabellen leven in het aparte `sander`-schema — queries via
// deze client raken dus nooit mmm.* aan. Auth (auth.users) is gedeeld.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { db: { schema: "sander" } },
  );
}
