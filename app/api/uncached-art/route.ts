// GET /api/uncached-art — pieces of yours that will render blank in production.
//
// Some museum CDNs refuse Vercel's datacenter IPs, and for the museums in
// MUSEUMS_NEEDING_CACHE the browser's direct-from-museum fallback is refused
// too, so a piece with no cached copy has no route to the visitor at all — it
// falls back to a title card on the wall.
//
// Nothing writes image_cached_url at save time, and nothing can: the copy has to
// be made from a connection the museum will actually serve, which is precisely
// what Vercel is not. So it stays a manual step, and this endpoint exists to
// make the manual step VISIBLE rather than something a curator discovers as a
// blank frame days later.
//
// Owner-only, and scoped to the caller's own artworks by RLS plus an explicit
// user filter on the join.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { MUSEUMS_NEEDING_CACHE } from "@/lib/museum-image";

type Row = {
  id: string;
  title: string | null;
  source_museum: string | null;
  image_cached_url: string | null;
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ count: 0, pieces: [] });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Only artworks this curator actually has on display — placed into one of
  // their galleries — so the count matches what they'd see on a wall.
  const { data: placed } = await supabase
    .from("placed_artworks")
    .select("artwork_id, galleries!inner(user_id)")
    .eq("galleries.user_id", user.id);
  const ids = [...new Set(((placed as { artwork_id: string }[] | null) ?? []).map((p) => p.artwork_id))];
  if (!ids.length) return NextResponse.json({ count: 0, pieces: [] });

  const { data } = await supabase
    .from("artworks")
    .select("id, title, source_museum, image_cached_url")
    .in("id", ids)
    .in("source_museum", MUSEUMS_NEEDING_CACHE)
    .is("image_cached_url", null);

  const pieces = ((data as Row[] | null) ?? []).map((a) => ({
    title: a.title || "Untitled",
    museum: a.source_museum,
  }));

  return NextResponse.json({
    count: pieces.length,
    pieces: pieces.slice(0, 20),
    // The exact command that fixes it, so the UI never has to hardcode it.
    fix: "node scripts/cache-artwork-images.mjs --museum artic",
  });
}
