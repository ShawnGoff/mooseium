// GET /api/museum-placements?u=<handle>
// Public read of a curator's free-standing museum placements — paintings hung
// directly on wing/atrium walls (and, later, objects), OUTSIDE the gallery
// collections. Each row is denormalized (title/image/size), so the 3D can hang
// it without resolving an adapter. Powers the read side of the in-museum editor.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

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
    .select("slot_kind, slot_key, source, external_id, title, image_url, real_w, real_h, rotation_y, mount")
    .eq("user_id", profile.id);

  const placements = ((data as Row[] | null) ?? []).map((r) => ({
    slotKind: r.slot_kind,
    slotKey: r.slot_key,
    source: r.source,
    externalId: r.external_id,
    rotationY: r.rotation_y,
    mount: r.mount,
    piece: {
      title: r.title ?? "Untitled",
      image: r.image_url ?? "",
      museum: r.source,
      realW: r.real_w ?? undefined,
      realH: r.real_h ?? undefined,
    },
  }));

  return NextResponse.json({ placements });
}
