// GET /api/museum-placements?u=<handle>
// Public read of a curator's free-standing museum placements — paintings hung
// directly on wing/atrium walls (and, later, objects), OUTSIDE the gallery
// collections. Each row is denormalized (title/image/size), so the 3D can hang
// it without resolving an adapter. Powers the read side of the in-museum editor.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getAdapter } from "@/lib/museums";
import { decodeEntities } from "@/lib/util/text";

// Free-placed art also lives in a lazy per-location 2D collection. These are
// marked in_museum=false so /api/museum never turns them into 3D rooms — they're
// just the flat 2D home for what you've hung in that part of the museum.
//
// The collection is resolved by its SLOT, never by its name: these collections
// are user-facing, so the curator can rename one or flip its "show in my 3D
// museum" toggle, and neither may cost us the mapping (a missed lookup would
// mint a duplicate collection and strand the piece on removal). galleries.
// location_slot holds this id; see 0029_gallery_location_slot.sql.
//
// One slot per museum LOCATION, not per wall: every atrium wall shares "Main
// Room", and a wing's four walls share that wing's collection.
function locationFor(slotKey: string): { slot: string; name: string } | null {
  const [zone, side] = slotKey.split(":");
  if (zone === "atrium") return { slot: "atrium", name: "Main Room" };
  if (zone === "wing") {
    if (side === "N") return { slot: "wing:N", name: "North Gallery" };
    if (side === "W") return { slot: "wing:W", name: "West Gallery" };
    if (side === "E") return { slot: "wing:E", name: "East Gallery" };
  }
  return null;
}

type Row = {
  slot_kind: string;
  slot_key: string;
  source: string;
  external_id: string;
  title: string | null;
  image_url: string | null;
  real_w: number | null;
  real_h: number | null;
  rotation_y: number;
  mount: string;
  pos_x: number | null;
  pos_y: number | null;
  pos_z: number | null;
};

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ placements: [] });

  const handle = (req.nextUrl.searchParams.get("u") || "").replace(/^@/, "").toLowerCase();
  if (!handle) {
    return NextResponse.json({ error: "u (handle) is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", handle)
    .single<{ id: string }>();
  if (!profile) return NextResponse.json({ placements: [] });

  const { data } = await supabase
    .from("museum_placements")
    .select(
      "slot_kind, slot_key, source, external_id, title, image_url, real_w, real_h, rotation_y, mount, pos_x, pos_y, pos_z"
    )
    .eq("user_id", profile.id);

  const rows = (data as Row[] | null) ?? [];

  // Prefer our cached copy of each image over the museum's own URL. The stored
  // image_url is denormalized onto the placement, so the cache lives one hop away
  // in artworks — worth the extra read, because several museum CDNs refuse
  // Vercel's IPs and 502 in production (see 0030_artwork_image_cache.sql).
  const cached = new Map<string, string>();
  const ids = [...new Set(rows.map((r) => r.external_id))];
  if (ids.length) {
    const { data: arts } = await supabase
      .from("artworks")
      .select("source_museum, museum_object_id, image_cached_url")
      .in("museum_object_id", ids)
      .not("image_cached_url", "is", null);
    for (const a of (arts as
      | { source_museum: string; museum_object_id: string; image_cached_url: string }[]
      | null) ?? []) {
      cached.set(`${a.source_museum}:${a.museum_object_id}`, a.image_cached_url);
    }
  }

  const placements = rows.map((r) => ({
    slotKind: r.slot_kind,
    slotKey: r.slot_key,
    source: r.source,
    externalId: r.external_id,
    rotationY: r.rotation_y,
    mount: r.mount,
    pos:
      r.pos_x != null && r.pos_y != null && r.pos_z != null
        ? ([r.pos_x, r.pos_y, r.pos_z] as [number, number, number])
        : null,
    piece: {
      title: r.title ?? "Untitled",
      image: cached.get(`${r.source}:${r.external_id}`) ?? r.image_url ?? "",
      museum: r.source,
      realW: r.real_w ?? undefined,
      realH: r.real_h ?? undefined,
    },
  }));

  return NextResponse.json({ placements });
}

// POST /api/museum-placements — create or replace the piece at a slot.
// Owner-only: RLS checks auth.uid() = user_id; we also stamp user_id from the
// session. Upserts on (user_id, slot_kind, slot_key) so re-assigning a slot
// swaps the piece rather than erroring.
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.slotKey || !body?.source || !body?.externalId) {
    return NextResponse.json(
      { error: "slotKey, source and externalId are required." },
      { status: 400 }
    );
  }

  const row = {
    user_id: user.id,
    slot_kind: body.slotKind === "object" ? "object" : "wall",
    slot_key: String(body.slotKey),
    source: String(body.source),
    external_id: String(body.externalId),
    title: body.title ?? null,
    image_url: body.imageUrl ?? null,
    real_w: typeof body.realW === "number" ? body.realW : null,
    real_h: typeof body.realH === "number" ? body.realH : null,
    rotation_y: typeof body.rotationY === "number" ? body.rotationY : 0,
    mount: body.mount === "floor" ? "floor" : "pedestal",
    pos_x: typeof body.posX === "number" ? body.posX : null,
    pos_y: typeof body.posY === "number" ? body.posY : null,
    pos_z: typeof body.posZ === "number" ? body.posZ : null,
  };

  const { error } = await supabase
    .from("museum_placements")
    .upsert(row, { onConflict: "user_id,slot_kind,slot_key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Also add the piece to its lazy per-location 2D collection (best-effort; the
  // placement itself already succeeded).
  const loc = locationFor(row.slot_key);
  if (loc) {
    try {
      const { data: found } = await supabase
        .from("galleries")
        .select("id")
        .eq("user_id", user.id)
        .eq("location_slot", loc.slot)
        .limit(1)
        .maybeSingle();
      let galleryId = (found as { id: string } | null)?.id;
      if (!galleryId) {
        // The name is the curator's to change from here on; only location_slot
        // is load-bearing. in_museum=false keeps it out of the 3D museum, where
        // its pieces are already hanging on the walls.
        const { data: created } = await supabase
          .from("galleries")
          .insert({
            user_id: user.id,
            name: loc.name,
            in_museum: false,
            location_slot: loc.slot,
          })
          .select("id")
          .single();
        galleryId = (created as { id: string } | null)?.id;
      }
      const adapter = galleryId ? getAdapter(row.source) : undefined;
      if (galleryId && adapter) {
        const art = await adapter.getObject(row.external_id);
        if (art.rights.isOpenAccess && art.sourceImageUrl) {
          await supabase.rpc("save_artwork_to_gallery", {
            p_gallery_id: galleryId,
            p_source_museum: art.sourceMuseum,
            p_museum_object_id: art.museumObjectId,
            p_title: decodeEntities(art.title),
            p_artist: decodeEntities(art.artist) ?? null,
            p_date_text: decodeEntities(art.dateText) ?? null,
            p_medium: decodeEntities(art.medium) ?? null,
            p_culture: decodeEntities(art.culture) ?? null,
            p_dimensions: decodeEntities(art.dimensions) ?? null,
            p_object_type: decodeEntities(art.objectType) ?? null,
            p_description: decodeEntities(art.description) ?? null,
            p_credit_line: decodeEntities(art.creditLine) ?? null,
            p_tags: art.tags ?? [],
            p_rights_status: art.rights.status,
            p_license: art.rights.license ?? null,
            p_attribution: art.rights.attribution ?? null,
            p_source_image_url: art.sourceImageUrl,
            p_image_thumb_url: adapter.getImageUrl(art, 400),
            p_image_medium_url: adapter.getImageUrl(art, 1024),
            p_image_large_url: adapter.getImageUrl(art, 2048),
            p_aspect_ratio: art.aspectRatio ?? null,
            p_source_url: art.sourceUrl ?? null,
            p_raw_metadata: art.raw ?? {},
          });
        }
      }
    } catch {
      /* collection sync is best-effort */
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/museum-placements?slotKey=...&slotKind=wall — clear a slot.
export async function DELETE(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const slotKey = req.nextUrl.searchParams.get("slotKey");
  const slotKind = req.nextUrl.searchParams.get("slotKind") === "object" ? "object" : "wall";
  if (!slotKey) {
    return NextResponse.json({ error: "slotKey is required." }, { status: 400 });
  }

  // Grab the piece's identity before deleting, so we can also pull it from its
  // location collection.
  const { data: existing } = await supabase
    .from("museum_placements")
    .select("source, external_id")
    .eq("user_id", user.id)
    .eq("slot_kind", slotKind)
    .eq("slot_key", slotKey)
    .maybeSingle();

  const { error } = await supabase
    .from("museum_placements")
    .delete()
    .eq("user_id", user.id)
    .eq("slot_kind", slotKind)
    .eq("slot_key", slotKey);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const loc = existing ? locationFor(slotKey) : null;
  if (existing && loc) {
    try {
      const ex = existing as { source: string; external_id: string };
      const { data: gal } = await supabase
        .from("galleries")
        .select("id")
        .eq("user_id", user.id)
        .eq("location_slot", loc.slot)
        .limit(1)
        .maybeSingle();
      const { data: art } = await supabase
        .from("artworks")
        .select("id")
        .eq("source_museum", ex.source)
        .eq("museum_object_id", ex.external_id)
        .limit(1)
        .maybeSingle();
      const galleryId = (gal as { id: string } | null)?.id;
      const artworkId = (art as { id: string } | null)?.id;
      if (galleryId && artworkId) {
        await supabase
          .from("placed_artworks")
          .delete()
          .eq("gallery_id", galleryId)
          .eq("artwork_id", artworkId);
      }
    } catch {
      /* best-effort */
    }
  }
  return NextResponse.json({ ok: true });
}
