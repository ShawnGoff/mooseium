// POST /api/collections/[id]/remove  { artworkId }
// Removes a piece from a collection (deletes the placed_artworks row). The
// artwork stays in the shared catalog and in any other collections.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await checkRateLimit(req, "collection-remove", 60, 60_000);
  if (limited) return limited;
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  let body: { artworkId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.artworkId) {
    return NextResponse.json({ error: "artworkId is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { error } = await supabase
    .from("placed_artworks")
    .delete()
    .eq("gallery_id", id)
    .eq("artwork_id", body.artworkId);

  if (error) {
    return NextResponse.json({ error: "Could not remove the piece." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
