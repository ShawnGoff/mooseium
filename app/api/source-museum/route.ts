// GET /api/source-museum?m=met — a pre-populated, cached "museum" for ONE source
// institution: themed galleries filled from that museum's OWN open-access art,
// shaped like /api/museum so the 3D shell can render it. Cached hard (weekly) so
// we never hit the museum APIs per pageview (Harvard has a daily cap).
//
// These power the /museum/[slug] showcase pages. Phase 1: static themes +
// search thumbnails. Later: admin curation + LLM-picked themes + daily refresh.

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getAdapter } from "@/lib/museums";
import { parseDims } from "@/lib/artwork-dimensions";

const MUSEUM_NAMES: Record<string, string> = {
  met: "The Metropolitan Museum of Art",
  artic: "Art Institute of Chicago",
  cleveland: "Cleveland Museum of Art",
  rijks: "Rijksmuseum",
  harvard: "Harvard Art Museums",
  smithsonian: "Smithsonian Open Access",
  vam: "Victoria and Albert Museum",
};

// Static themed layout: 3 wings × 3 galleries. Each gallery is one search
// scoped to the museum. (LLM-curated themes come later.)
const WINGS: { name: string; galleries: { name: string; query: string }[] }[] = [
  {
    name: "Land & Sea",
    galleries: [
      { name: "Landscapes", query: "landscape" },
      { name: "Seascapes", query: "seascape" },
      { name: "Rivers & Bridges", query: "river bridge" },
    ],
  },
  {
    name: "People & Myth",
    galleries: [
      { name: "Portraits", query: "portrait" },
      { name: "Everyday Life", query: "genre scene" },
      { name: "Gods & Myths", query: "mythology" },
    ],
  },
  {
    name: "Still & Wild",
    galleries: [
      { name: "Still Life", query: "still life" },
      { name: "Flowers", query: "flowers" },
      { name: "Animals", query: "animals" },
    ],
  },
];

type SourcePiece = {
  title: string;
  artist?: string;
  image: string;
  museum: string;
  // Real-world size in metres, when the museum states it. Drives both how large
  // the piece hangs and how much wall the layout reserves for it.
  realW?: number;
  realH?: number;
};
type SourceCollection = {
  id: string;
  name: string;
  slug: string;
  count: number;
  pieces: SourcePiece[];
};
type SourceWing = { name: string; collections: SourceCollection[] };

// Matches the 3D museum's own cap. It was 11, which sent three more pieces than
// a gallery room can hang — the surplus stacked on the entry wall and z-fought.
// The client caps too, but building three extra pieces per gallery also meant
// three needless getObject calls apiece.
const GALLERY_CAP = 8;

// Search results carry no dimensions, so every piece used to fall back to a
// fixed 1.7m height and a 2.2m width reservation: a miniature and a large canvas
// rendered identically, and the layout spaced everything around a phantom width
// nearly double the real one. The full record has the museum's own dimensions
// text, so resolve it per piece and parse it — the same treatment gallery pieces
// already get. This is what lets a big canvas claim a wall to itself.
//
// Costs one extra museum call per piece, which is affordable only because this
// route is cached for a week. Bounded concurrency keeps the burst off the
// museums' rate limits, and a failure just leaves that piece undimensioned
// rather than failing the gallery.
async function withDimensions(
  adapter: ReturnType<typeof getAdapter>,
  pieces: SourcePiece[],
  ids: string[]
): Promise<SourcePiece[]> {
  if (!adapter) return pieces;
  const LIMIT = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < pieces.length) {
      const i = cursor++;
      try {
        const art = await adapter!.getObject(ids[i]);
        const dims = parseDims(art.dimensions);
        if (dims) {
          pieces[i].realW = dims.w;
          pieces[i].realH = dims.h;
        }
      } catch {
        /* leave this piece undimensioned; it renders at the fallback size */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LIMIT, pieces.length) }, worker));
  return pieces;
}

async function resolveGallery(
  slug: string,
  name: string,
  query: string
): Promise<SourceCollection | null> {
  const adapter = getAdapter(slug);
  if (!adapter) return null;
  try {
    const res = await adapter.search({
      query,
      filters: {},
      page: 1,
      pageSize: GALLERY_CAP,
      hasImage: true,
      openAccessOnly: true,
    });
    const cards = res.cards.filter((c) => c.thumbnailUrl).slice(0, GALLERY_CAP);
    const pieces: SourcePiece[] = cards.map((c) => ({
      title: c.title,
      artist: c.artist,
      image: c.thumbnailUrl,
      museum: slug,
    }));
    if (pieces.length === 0) return null;
    await withDimensions(
      adapter,
      pieces,
      cards.map((c) => c.museumObjectId)
    );
    return {
      id: `src:${slug}:${name}`,
      name,
      slug: `src-${slug}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      count: pieces.length,
      pieces,
    };
  } catch {
    return null;
  }
}

async function buildSourceMuseum(slug: string) {
  const wings: SourceWing[] = [];
  for (const w of WINGS) {
    const resolved = await Promise.all(
      w.galleries.map((g) => resolveGallery(slug, g.name, g.query))
    );
    const collections = resolved.filter((c): c is SourceCollection => c !== null);
    if (collections.length) wings.push({ name: w.name, collections });
  }
  return {
    name: MUSEUM_NAMES[slug] ?? slug,
    curator: "Mooseium",
    handle: `museum/${slug}`,
    wings,
  };
}

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("m") || "").toLowerCase();
  if (!getAdapter(slug)) return NextResponse.json({ museum: null });
  // Cache the whole built museum for a week — the art barely changes and this
  // keeps us off the museum APIs on every visit.
  const museum = await unstable_cache(
    () => buildSourceMuseum(slug),
    ["source-museum", slug],
    { revalidate: 60 * 60 * 24 * 7 }
  )();
  return NextResponse.json({ museum });
}
