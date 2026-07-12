// GET /api/recent-saves — the signed-in user's most recently saved pieces,
// across all their collections. Returns cards in the search/discover shape.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

type Row = {
  created_at: string;
  artworks: {
    source_museum: string | null;
    museum_object_id: string | null;
    title: string | null;
    artist: string | null;
    date_text: string | null;
    object_type: string | null;
    image_thumb_url: string | null;
  } | null;
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ cards: [] });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ cards: [] });
  }

  const { data, error } = await supabase
    .from("placed_artworks")
    .select(
      "created_at, galleries!inner(user_id), artworks(source_museum, museum_object_id, title, artist, date_text, object_type, image_thumb_url)"
    )
    .eq("galleries.user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    return NextResponse.json({ cards: [] });
  }

  // De-dupe by artwork (the same piece can be saved into several collections).
  const seen = new Set<string>();
  const cards = ((data as unknown as Row[] | null) ?? [])
    .map((r) => r.artworks)
    .filter((a): a is NonNullable<Row["artworks"]> => Boolean(a?.museum_object_id))
    .filter((a) => {
      const key = `${a.source_museum}-${a.museum_object_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((a) => ({
      sourceMuseum: a.source_museum ?? "",
      museumObjectId: a.museum_object_id ?? "",
      title: a.title ?? "Untitled",
      artist: a.artist ?? undefined,
      dateText: a.date_text ?? undefined,
      objectType: a.object_type ?? undefined,
      thumbnailUrl: a.image_thumb_url ?? "",
    }));

  return NextResponse.json({ cards });
}
