// POST /api/collections/[id]/layout
//   { order?: string[] }                        -> set piece order (artworkIds)
//   { setFeature?: { artworkId, feature } }      -> mark a piece as a feature
// RLS scopes all placement writes to the gallery owner.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await checkRateLimit(req, "layout", 60, 60_000);
  if (limited) return limited;
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  let body: { order?: string[]; setFeature?: { artworkId: string; feature: boolean } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  try {
    if (Array.isArray(body.order)) {
      await Promise.all(
        body.order.slice(0, 500).map((artworkId, i) =>
          supabase
            .from("placed_artworks")
            .update({ sort_order: i })
            .eq("gallery_id", id)
            .eq("artwork_id", artworkId)
        )
      );
    }
    if (body.setFeature) {
      await supabase
        .from("placed_artworks")
        .update({ section: body.setFeature.feature ? "feature" : null })
        .eq("gallery_id", id)
        .eq("artwork_id", body.setFeature.artworkId);
    }
  } catch {
    return NextResponse.json({ error: "Could not update layout." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
