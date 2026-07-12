// POST   /api/saved-galleries  { galleryId }   -> bookmark a public gallery
// DELETE /api/saved-galleries?galleryId=...     -> remove the bookmark

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limited = await checkRateLimit(req, "save-gallery", 40, 60_000);
  if (limited) return limited;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }
  let body: { galleryId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.galleryId) {
    return NextResponse.json({ error: "galleryId is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { error } = await supabase
    .from("saved_galleries")
    .upsert(
      { user_id: user.id, gallery_id: body.galleryId },
      { onConflict: "user_id,gallery_id" }
    );
  if (error) {
    return NextResponse.json({ error: "Could not save the gallery." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }
  const galleryId = new URL(req.url).searchParams.get("galleryId");
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

  const { error } = await supabase
    .from("saved_galleries")
    .delete()
    .eq("user_id", user.id)
    .eq("gallery_id", galleryId);
  if (error) {
    return NextResponse.json({ error: "Could not remove." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
