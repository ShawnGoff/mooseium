// GET /api/gallery-pieces?slug=<share_slug>
// Public: returns the pieces of a published gallery (title, artist, image) for
// the 3D room. RLS already permits reading public galleries + their placements.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";

// Best-effort parse of a museum's free-text dimensions into meters {w, h}.
// Convention across these museums is Height × Width. Returns null if unsure.
function parseDims(s?: string | null): { w: number; h: number } | null {
  if (!s) return null;
  const t = s.toLowerCase();
  const ok = (h: number, w: number) =>
    h > 0.02 && w > 0.02 && h < 8 && w < 10 ? { w, h } : null;

  // "A × B cm" (optionally preceded by an inches figure we ignore).
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:×|x|by)\s*(\d+(?:\.\d+)?)\s*cm/);
  if (m) return ok(parseFloat(m[1]) / 100, parseFloat(m[2]) / 100);

  // "height A cm ... width B cm"
  const hm = t.match(/(?:height|h)\D{0,4}(\d+(?:\.\d+)?)\s*cm/);
  const wm = t.match(/(?:width|w)\D{0,4}(\d+(?:\.\d+)?)\s*cm/);
  if (hm && wm) return ok(parseFloat(hm[1]) / 100, parseFloat(wm[1]) / 100);

  // Inches fallback: "A × B in"
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:×|x|by)\s*(\d+(?:\.\d+)?)\s*(?:in\b|inch)/);
  if (m) return ok(parseFloat(m[1]) * 0.0254, parseFloat(m[2]) * 0.0254);

  return null;
}

type Row = {
  sort_order: number;
  section: string | null;
  artworks: {
    title: string | null;
    artist: string | null;
    date_text: string | null;
    culture: string | null;
    medium: string | null;
    dimensions: string | null;
    description: string | null;
    source_museum: string | null;
    source_url: string | null;
    image_medium_url: string | null;
    image_large_url: string | null;
    image_thumb_url: string | null;
  } | null;
};

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "gallery-pieces", 150, 60_000);
  if (limited) return limited;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ name: null, pieces: [] });
  }
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: gallery } = await supabase
    .from("galleries")
    .select("id, name")
    .eq("share_slug", slug)
    .eq("is_public", true)
    .single<{ id: string; name: string }>();

  if (!gallery) {
    return NextResponse.json({ name: null, pieces: [] });
  }

  const { data } = await supabase
    .from("placed_artworks")
    .select(
      "sort_order, section, artworks(title, artist, date_text, culture, medium, dimensions, description, source_museum, source_url, image_medium_url, image_large_url, image_thumb_url)"
    )
    .eq("gallery_id", gallery.id)
    .order("sort_order", { ascending: true });

  const pieces = ((data as unknown as Row[] | null) ?? [])
    .map((r) => {
      const a = r.artworks;
      const image = a?.image_medium_url || a?.image_large_url || a?.image_thumb_url;
      if (!image) return null;
      const dims = parseDims(a?.dimensions);
      return {
        title: a?.title || "Untitled",
        artist: a?.artist || undefined,
        dateText: a?.date_text || undefined,
        culture: a?.culture || undefined,
        medium: a?.medium || undefined,
        description: a?.description || undefined,
        museum: a?.source_museum || undefined,
        sourceUrl: a?.source_url || undefined,
        realW: dims?.w,
        realH: dims?.h,
        image,
        imageThumb: a?.image_thumb_url || undefined,
        feature: r.section === "feature",
      };
    })
    .filter(Boolean);

  return NextResponse.json({ name: gallery.name, pieces });
}
