// GET  /api/collections        -> the signed-in user's collections (+ piece counts)
// POST /api/collections {name}  -> create a new collection, returns { id, name }

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ collections: [] });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // Pull each collection's placement timestamps so we can sort by the most
  // recently added piece (falling back to the collection's own creation time).
  const { data, error } = await supabase
    .from("galleries")
    .select("id, name, created_at, wing, in_museum, share_slug, placed_artworks(created_at)")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Could not load collections." }, { status: 500 });
  }

  type GalleryRow = {
    id: string;
    name: string;
    created_at: string;
    wing: string | null;
    in_museum: boolean | null;
    share_slug: string | null;
    placed_artworks: { created_at: string }[];
  };

  const collections = ((data as GalleryRow[] | null) ?? [])
    .map((g) => {
      const placed = g.placed_artworks ?? [];
      const lastActivity = placed.reduce(
        (max, p) => (p.created_at > max ? p.created_at : max),
        g.created_at
      );
      return {
        id: g.id,
        name: g.name,
        count: placed.length,
        lastActivity,
        wing: (g.wing ?? "").trim() || null,
        inMuseum: g.in_museum !== false, // null/true = shown in the 3D museum
        shareSlug: g.share_slug, // null = a location collection, not a real gallery
      };
    })
    .sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));

  return NextResponse.json({ collections });
}

export async function POST(req: Request) {
  const limited = await checkRateLimit(req, "collection-create", 30, 60_000);
  if (limited) return limited;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("galleries")
    .insert({ user_id: user.id, name })
    .select("id, name")
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not create collection." }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, name: data.name });
}
