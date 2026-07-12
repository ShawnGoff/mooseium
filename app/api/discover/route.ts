// GET /api/discover — the "Popular right now" feed: most-saved pieces across
// all users. Public (works signed out). Returns cards in the search shape.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

type ArtworkRow = {
  source_museum: string;
  museum_object_id: string;
  title: string | null;
  artist: string | null;
  date_text: string | null;
  object_type: string | null;
  image_thumb_url: string | null;
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ cards: [] });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_popular_artworks", {
    p_limit: 12,
  });

  if (error) {
    return NextResponse.json({ cards: [] });
  }

  const cards = ((data as ArtworkRow[] | null) ?? []).map((a) => ({
    sourceMuseum: a.source_museum,
    museumObjectId: a.museum_object_id,
    title: a.title ?? "Untitled",
    artist: a.artist ?? undefined,
    dateText: a.date_text ?? undefined,
    objectType: a.object_type ?? undefined,
    thumbnailUrl: a.image_thumb_url ?? "",
  }));

  return NextResponse.json({ cards });
}
