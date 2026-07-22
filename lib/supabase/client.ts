"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (publishable key). All mmm tables live in the `mmm`
// schema, so queries use `.schema("mmm")`; auth stays on the default schema.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
