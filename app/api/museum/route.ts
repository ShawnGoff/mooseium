// GET /api/museum?u=<handle>
// Public: a curator's "museum" — their display/museum name plus their public
// galleries as the doors off the atrium. "Smart default": a collection the
// curator assigned to a named wing groups under that wing (a hall of rooms); a
// collection with no wing stands on its own as a room straight off the atrium.
// So the museum is only as deep as the curator organized it. Powers the 3D museum.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { publicCache } from "@/lib/http-cache";
import { checkRateLimit } from "@/lib/rate-limit";

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  museum_name: string | null;
  center_wing_name: string | null;
};

type GalleryRow = {
  id: string;
  name: string;
  share_slug: string | null;
  wing: string | null;
  in_museum: boolean | null;
  created_at: string;
  placed_artworks: { id: string }[];
};

type Collection = { id: string; name: string; slug: string; count: number };
type Wing = { name: string; collections: Collection[]; isDefault?: boolean };

export async function GET(req: NextRequest) {
  // Only bites on cache MISSES — a CDN hit never reaches this function — so it
  // throttles someone walking many handles, not ordinary museum traffic.
  const limited = await checkRateLimit(req, "museum", 120, 60_000);
  if (limited) return limited;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ museum: null });
  }
  const handle = (req.nextUrl.searchParams.get("u") || "")
    .replace(/^@/, "")
    .toLowerCase();
  if (!handle) {
    return NextResponse.json({ error: "u (handle) is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, username, museum_name, center_wing_name")
    .eq("username", handle)
    .single<ProfileRow>();

  if (!profile) {
    return NextResponse.json({ museum: null });
  }

  const { data: galleries } = await supabase
    .from("galleries")
    .select("id, name, share_slug, wing, in_museum, created_at, placed_artworks(id)")
    .eq("user_id", profile.id)
    .eq("is_public", true)
    .not("share_slug", "is", null)
    .order("created_at", { ascending: true });

  // Group collections into wings. A named wing (galleries.wing) gathers its
  // collections; everything unfiled collects into a single "Main Gallery" wing
  // so the museum maps onto the atrium → wings → galleries structure. Named
  // wings lead in creation order; the default wing sorts last.
  const named: Wing[] = [];
  const namedIndex = new Map<string, number>();
  const unfiled: Collection[] = [];
  for (const g of (galleries as GalleryRow[] | null) ?? []) {
    const count = g.placed_artworks?.length ?? 0;
    if (count === 0 || !g.share_slug || g.in_museum === false) continue;
    const collection: Collection = { id: g.id, name: g.name, slug: g.share_slug, count };
    const wingName = (g.wing ?? "").trim();
    if (wingName) {
      let idx = namedIndex.get(wingName);
      if (idx === undefined) {
        idx = named.length;
        named.push({ name: wingName, collections: [] });
        namedIndex.set(wingName, idx);
      }
      named[idx].collections.push(collection);
    } else {
      unfiled.push(collection);
    }
  }

  const wings: Wing[] = [...named];
  if (unfiled.length) {
    const centerName = (profile.center_wing_name ?? "").trim() || "Main Gallery";
    wings.push({ name: centerName, collections: unfiled, isDefault: true });
  }

  const curator = profile.display_name || `@${profile.username}`;
  const museumName = profile.museum_name || `${curator}'s Museum`;

  return NextResponse.json(
    {
      museum: {
        name: museumName,
        curator,
        handle: profile.username,
        wings,
      },
    },
    // Short window: a curator publishing a gallery wants visitors to see it
    // soon, and their own reload cache-busts past this anyway.
    { headers: publicCache(30) }
  );
}
