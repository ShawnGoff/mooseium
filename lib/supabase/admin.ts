// lib/supabase/admin.ts
// Service-role Supabase client for SERVER-ONLY jobs that must bypass RLS —
// e.g. the discover-shelves generator writing the cache. It uses the secret
// service role key, so it must NEVER be imported into client code.

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Service role not configured (need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
