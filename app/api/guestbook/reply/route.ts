// POST /api/guestbook/reply  { galleryId, entryUserId, reply }
// The gallery owner replies to (or edits/clears) a visitor's signature.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limited = await checkRateLimit(req, "guestbook-reply", 30, 60_000);
  if (limited) return limited;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  let body: { galleryId?: string; entryUserId?: string; reply?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.galleryId || !body.entryUserId) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }
  const reply = (body.reply ?? "").trim().slice(0, 280) || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // RLS ("owner may reply") ensures only the gallery's owner can update this row.
  const { error } = await supabase
    .from("guestbook_entries")
    .update({ owner_reply: reply, owner_reply_at: reply ? new Date().toISOString() : null })
    .eq("gallery_id", body.galleryId)
    .eq("user_id", body.entryUserId);

  if (error) {
    return NextResponse.json({ error: "Could not save the reply." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reply });
}
