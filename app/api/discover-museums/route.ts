// GET /api/discover-museums — curators with public galleries, one card each,
// for the homepage "Museums to wander" row. Links to /@handle/museum (3D).
// Works signed out (RLS: public galleries + public profiles are readable).
//
// Robust by design: galleries and profiles are queried separately (no reliance
// on an embedded join), and the cover accepts any available image size.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

type GalRow = {
  name: string;
  user_id: string;
  in_museum: boolean | null;
  updated_at: string | null;
  placed_artworks: {
    sort_order: number;
    section: string | null;
    artworks: {
      image_thumb_url: string | null;
      image_medium_url: string | null;
    } | null;
  }[];
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  museum_name: string | null;
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ museums: [] });
  }
  const supabase = await createClient();

  const { data: gals } = await supabase
    .from("galleries")
    .select(
      "name, user_id, in_museum, updated_at, placed_artworks(sort_order, section, artworks(image_thumb_url, image_medium_url))"
    )
    .eq("is_public", true)
    .not("share_slug", "is", null)
    .order("updated_at", { ascending: false })
    .limit(120);

  const rows = (gals as unknown as GalRow[] | null) ?? [];

  // Aggregate galleries into one museum per curator (user_id), most recent first.
  const byUser = new Map<
    string,
    { cover?: string; galleryCount: number; pieceCount: number }
  >();
  for (const g of rows) {
    const uid = g.user_id;
    const pieces = g.placed_artworks ?? [];
    if (!uid || pieces.length === 0 || g.in_museum === false) continue;
    let m = byUser.get(uid);
    if (!m) {
      m = { galleryCount: 0, pieceCount: 0 };
      byUser.set(uid, m);
    }
    m.galleryCount += 1;
    m.pieceCount += pieces.length;
    if (!m.cover) {
      const placed = [...pieces].sort((a, b) => {
        if (a.section === "feature" && b.section !== "feature") return -1;
        if (b.section === "feature" && a.section !== "feature") return 1;
        return a.sort_order - b.sort_order;
      });
      m.cover = placed
        .map((p) => p.artworks?.image_thumb_url || p.artworks?.image_medium_url)
        .find((u): u is string => Boolean(u));
    }
  }

  const userIds = [...byUser.keys()];
  if (userIds.length === 0) {
    return NextResponse.json({ museums: [] });
  }

  const { data: profs } = await supabase
    .from("profiles")
    .select("id, username, display_name, museum_name")
    .in("id", userIds);

  const profById = new Map(
    ((profs as ProfileRow[] | null) ?? []).map((p) => [p.id, p])
  );

  const museums = userIds
    .map((uid) => {
      const m = byUser.get(uid)!;
      const p = profById.get(uid);
      if (!p?.username || !m.cover) return null;
      const curator = p.display_name || `@${p.username}`;
      return {
        handle: p.username,
        curator,
        museumName: p.museum_name || `${curator}'s Museum`,
        cover: m.cover,
        galleryCount: m.galleryCount,
        pieceCount: m.pieceCount,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .slice(0, 12);

  return NextResponse.json({ museums });
}
