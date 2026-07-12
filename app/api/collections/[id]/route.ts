// PATCH  /api/collections/[id]  { name }  -> rename a collection
// DELETE /api/collections/[id]            -> delete a collection (cascades pieces)
// Row-level security ensures a user can only touch their own collections.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await checkRateLimit(req, "collection-edit", 40, 60_000);
  if (limited) return limited;
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  let body: { name?: string; guestbookEnabled?: boolean; wing?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "A name is required." }, { status: 400 });
    }
    patch.name = name;
  }
  if (typeof body.guestbookEnabled === "boolean") {
    patch.guestbook_enabled = body.guestbookEnabled;
  }
  if (typeof body.wing === "string" || body.wing === null) {
    patch.wing = (body.wing ?? "").trim() || null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { error } = await supabase.from("galleries").update(patch).eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Could not update." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...patch });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await checkRateLimit(req, "collection-delete", 30, 60_000);
  if (limited) return limited;
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { error } = await supabase.from("galleries").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Could not delete." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
