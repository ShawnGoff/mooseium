"use client";

// Keeps the server-rendered UI (Header, etc.) in sync with the browser's auth
// session. Without this, signing in/out or switching accounts updates the
// client but leaves stale server components — e.g. the Header still showing
// "Sign in", or one account's name beside another's data. On a real identity
// change we call router.refresh() to re-render the server tree with the new
// session.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function AuthRefresh() {
  const router = useRouter();
  // undefined = haven't seen the first event yet (don't refresh on initial load)
  const prevUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      if (prevUid.current !== undefined && prevUid.current !== uid) {
        // Sign-in (null→id), sign-out (id→null), or account switch (a→b).
        router.refresh();
      }
      prevUid.current = uid;
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
