// Which public Mooseium galleries contain a given museum artwork.
//
// This is what makes an artwork page worth indexing: a piece someone actually
// curated into a public gallery has earned a place in the index (and the page
// can say something the museum's own page can't). Everything else renders for
// visitors but stays noindex, which keeps crawl budget on real pages and avoids
// looking like a thin scraper site.

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export type ContainingGallery = { name: string; slug: string; curator?: string };

type PlacedRow = {
  galleries: {
    name: string;
    share_slug: string | null;
    profiles: { display_name: string | null } | null;
  } | null;
};

/** Public galleries that include this artwork. Empty array on any failure. */
export async function galleriesContaining(
  museum: string,
  objectId: string
): Promise<ContainingGallery[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("placed_artworks")
      .select(
        "galleries!inner(name, share_slug, is_public, profiles!galleries_user_id_fkey(display_name)), artworks!inner(source_museum, museum_object_id)"
      )
      .eq("artworks.source_museum", museum)
      .eq("artworks.museum_object_id", objectId)
      .eq("galleries.is_public", true)
      .not("galleries.share_slug", "is", null)
      .limit(24);

    const seen = new Set<string>();
    const out: ContainingGallery[] = [];
    for (const row of (data as unknown as PlacedRow[] | null) ?? []) {
      const g = row.galleries;
      if (!g?.share_slug || seen.has(g.share_slug)) continue;
      seen.add(g.share_slug);
      out.push({
        name: g.name,
        slug: g.share_slug,
        curator: g.profiles?.display_name ?? undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Every artwork placed in a public gallery — the set worth putting in the sitemap. */
export async function indexableArtworks(): Promise<
  { museum: string; objectId: string }[]
> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("placed_artworks")
      .select(
        "artworks!inner(source_museum, museum_object_id), galleries!inner(is_public, share_slug)"
      )
      .eq("galleries.is_public", true)
      .not("galleries.share_slug", "is", null)
      .limit(5000);

    type Row = { artworks: { source_museum: string; museum_object_id: string } | null };
    const seen = new Set<string>();
    const out: { museum: string; objectId: string }[] = [];
    for (const row of (data as unknown as Row[] | null) ?? []) {
      const a = row.artworks;
      if (!a?.source_museum || !a.museum_object_id) continue;
      const key = `${a.source_museum}/${a.museum_object_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ museum: a.source_museum, objectId: a.museum_object_id });
    }
    return out;
  } catch {
    return [];
  }
}
