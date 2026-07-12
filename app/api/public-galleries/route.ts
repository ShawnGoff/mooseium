// GET /api/public-galleries — recently updated public galleries, for the
// homepage discovery feed. Works signed out (RLS allows reading public rows).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

type Row = {
  name: string;
  share_slug: string | null;
  updated_at: string | null;
  profiles: { display_name: string | null; username: string | null } | null;
  placed_artworks: {
    sort_order: number;
    section: string | null;
    artworks: { image_thumb_url: string | null } | null;
  }[];
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ galleries: [] });
  }
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("galleries")
    .select(
      "name, share_slug, updated_at, profiles!galleries_user_id_fkey(display_name, username), placed_artworks(sort_order, section, artworks(image_thumb_url))"
    )
    .eq("is_public", true)
    .not("share_slug", "is", null)
    .order("updated_at", { ascending: false })
    .limit(18);

  if (error) {
    return NextResponse.json({ galleries: [] });
  }

  const galleries = ((data as unknown as Row[] | null) ?? [])
    .map((g) => {
      const placed = [...(g.placed_artworks ?? [])].sort((a, b) => {
        if (a.section === "feature" && b.section !== "feature") return -1;
        if (b.section === "feature" && a.section !== "feature") return 1;
        return a.sort_order - b.sort_order;
      });
      const cover = placed
        .map((p) => p.artworks?.image_thumb_url)
        .find((u): u is string => Boolean(u));
      return {
        slug: g.share_slug as string,
        name: g.name,
        cover,
        count: g.placed_artworks?.length ?? 0,
        curator: g.profiles?.display_name ?? "A curator",
        handle: g.profiles?.username ?? undefined,
      };
    })
    // Only show galleries with at least one image — better first impression.
    .filter((g) => g.cover)
    .slice(0, 12);

  return NextResponse.json({ galleries });
}
