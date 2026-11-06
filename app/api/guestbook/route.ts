// POST   /api/guestbook  { galleryId, message }  -> sign (or update your note)
// DELETE /api/guestbook?galleryId=...             -> remove your signature

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "guestbook", 20, 60_000);
  if (limited) return limited;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  let body: { galleryId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.galleryId) {
    return NextResponse.json({ error: "galleryId is required." }, { status: 400 });
  }
  const message = (body.message ?? "").trim().slice(0, 280) || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to sign the guestbook." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name?.trim() || "A visitor";

  const { data, error } = await supabase
    .from("guestbook_entries")
    .upsert(
      { gallery_id: body.galleryId, user_id: user.id, display_name: displayName, message },
      { onConflict: "gallery_id,user_id" }
    )
    .select("user_id, display_name, message, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not sign the guestbook." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, entry: data });
}

export async function DELETE(req: NextRequest) {
  const limited = await checkRateLimit(req, "guestbook-delete", 30, 60_000);
  if (limited) return limited;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }
  const params = new URL(req.url).searchParams;
  const galleryId = params.get("galleryId");
  if (!galleryId) {
    return NextResponse.json({ error: "galleryId is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // Optional target: the gallery owner can remove someone else's entry (RLS
  // allows owner-or-self deletes). Default is your own signature.
  const targetUserId = params.get("userId") ?? user.id;

  const { error } = await supabase
    .from("guestbook_entries")
    .delete()
    .eq("gallery_id", galleryId)
    .eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json({ error: "Could not remove your signature." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
