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
  };

  const { error } = await supabase
    .from("museum_placements")
    .upsert(row, { onConflict: "user_id,slot_kind,slot_key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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

  const { error } = await supabase
    .from("museum_placements")
    .delete()
    .eq("user_id", user.id)
    .eq("slot_kind", slotKind)
    .eq("slot_key", slotKey);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
