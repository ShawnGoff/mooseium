// POST /api/collections/[id]/note  { artworkId, note }
// Sets (or clears) the curator's note on a piece in a gallery. Owner only —
// row-level security scopes the update to the owner's own placements.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await checkRateLimit(req, "note", 40, 60_000);
  if (limited) return limited;
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  let body: { artworkId?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.artworkId) {
    return NextResponse.json({ error: "artworkId is required." }, { status: 400 });
  }

  const note = (body.note ?? "").trim().slice(0, 2000) || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { error } = await supabase
    .from("placed_artworks")
    .update({ note })
    .eq("gallery_id", id)
    .eq("artwork_id", body.artworkId);

  if (error) {
    return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, note });
}
