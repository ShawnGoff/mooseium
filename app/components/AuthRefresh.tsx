"use client";

// Keeps the server-rendered UI (Header, etc.) in sync with the browser's auth
// session. Two cases:
//   1. Desync on load — the browser has a session the server render didn't see
//      (e.g. right after an OAuth callback): the header shows "Sign in" or the
//      wrong account. We compare the browser's user id to what the server
//      rendered (`serverUid`) and refresh once if they disagree.
//   2. Live transitions — signing in/out or switching accounts in-tab.
// The one-shot guard on the desync path avoids any refresh loop if the server
// genuinely can't read the cookie.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function AuthRefresh({ serverUid }: { serverUid: string | null }) {
  const router = useRouter();
  const desyncFixed = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    let prev = serverUid;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;

      if (event === "INITIAL_SESSION") {
        // Browser session vs. what the server rendered.
        if (uid !== serverUid && !desyncFixed.current) {
          desyncFixed.current = true;
          router.refresh();
        }
        prev = uid;
      } else if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        if (uid !== prev) {
          prev = uid;
          router.refresh();
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [serverUid, router]);

  return null;
}
