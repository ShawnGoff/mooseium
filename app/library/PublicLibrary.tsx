"use client";

// Public discovery + reading, reusing the Den's Discover component in
// signed-out mode (userId = null): saving prompts sign-in, reading opens the
// public reader at /library/read/[gutenbergId].

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import DenDiscover from "../den/DenDiscover";

const NONE = new Set<string>();

export default function PublicLibrary() {
  const router = useRouter();

  // Signed-in visitors belong in their full study (/den). We check in the
  // browser rather than on the server so /library stays a cached static page.
  // Signed-out users (the majority, plus crawlers) render this immediately; a
  // logged-in user briefly sees it, then gets replaced to /den.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled && data.user) router.replace("/den");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="container">
      <div className="brand brand-row">
        <div>
          <h1>Library</h1>
          <span className="tag">read free public-domain books</span>
        </div>
        <Link href="/login" className="walk-3d-btn">
          Sign in to save
        </Link>
      </div>
      <div className="den-root">
        <DenDiscover userId={null} savedIds={NONE} onSaved={() => {}} />
      </div>
    </main>
  );
}
