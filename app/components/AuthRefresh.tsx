"use client";

// Keeps the server-rendered UI (Header) in sync with the browser's auth
// session. Right after an OAuth/magic-link login the server render can lag the
// browser session, leaving the header stuck on "Sign in" until a manual
// refresh. A *soft* router.refresh() wasn't enough, so on a genuine desync we
// do a real reload (what the user would do by hand) — guarded so it happens at
// most once, no loop if the server truly can't read the cookie.

import { useEffect } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function AuthRefresh({ serverUid }: { serverUid: string | null }) {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    let prev = serverUid;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;

      if (event === "INITIAL_SESSION") {
        if (uid !== serverUid) {
          // Browser has a session the server render didn't reflect.
          if (sessionStorage.getItem("auth-resync") !== "1") {
            sessionStorage.setItem("auth-resync", "1");
            window.location.reload();
          }
        } else {
          sessionStorage.removeItem("auth-resync");
        }
        prev = uid;
      } else if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        if (uid !== prev) {
          prev = uid;
          sessionStorage.removeItem("auth-resync");
          window.location.reload();
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [serverUid]);

  return null;
}
