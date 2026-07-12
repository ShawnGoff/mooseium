// POST /api/save  { museum, objectId }
// Saves a museum piece to the signed-in user's collection: fetches the full
// normalized record via the adapter, verifies it's open-access with an image,
// then calls the save_artwork RPC (which upserts the shared catalog row and
// links it to the user).

import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/museums";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { decodeEntities } from "@/lib/util/text";

export async function POST(req: Request) {
  const limited = await checkRateLimit(req, "save", 60, 60_000);
  if (limited) return limited;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 500 }
    );
  }

  let body: { museum?: string; objectId?: string; collectionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { museum, objectId, collectionId } = body;
  if (!museum || !objectId) {
    return NextResponse.json(
      { error: "museum and objectId are required." },
      { status: 400 }
    );
  }
  if (!collectionId) {
    return NextResponse.json(
      { error: "Choose a collection to save into." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to save." }, { status: 401 });
  }

  const adapter = getAdapter(museum);
  if (!adapter) {
    return NextResponse.json({ error: `Unknown museum: ${museum}` }, { status: 400 });
  }

  let art;
  try {
    art = await adapter.getObject(objectId);
  } catch {
    return NextResponse.json(
      { error: "Could not fetch that artwork from the museum." },
      { status: 502 }
    );
  }

  if (!art.rights.isOpenAccess || !art.sourceImageUrl) {
    return NextResponse.json(
      { error: "That piece isn't open-access or has no image." },
      { status: 422 }
    );
  }

  const { data, error } = await supabase.rpc("save_artwork_to_gallery", {
    p_gallery_id: collectionId,
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
    // Display URLs for now; the caching worker replaces these with our CDN copies.
    p_image_thumb_url: adapter.getImageUrl(art, 400),
    p_image_medium_url: adapter.getImageUrl(art, 1024),
    p_image_large_url: adapter.getImageUrl(art, 2048),
    p_aspect_ratio: art.aspectRatio ?? null,
    p_source_url: art.sourceUrl ?? null,
    p_raw_metadata: art.raw ?? {},
  });

  if (error) {
    console.error("save_artwork failed:", error);
    return NextResponse.json({ error: "Could not save the artwork." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, artworkId: data });
}
