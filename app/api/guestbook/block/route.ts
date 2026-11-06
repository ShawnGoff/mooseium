// POST   /api/guestbook/block  { userId }  -> block a user from your galleries
// DELETE /api/guestbook/block?userId=...    -> unblock
// Blocking hides that user's existing notes (via RLS) and prevents new ones.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limited = await checkRateLimit(req, "guestbook-block", 20, 60_000);
  if (limited) return limited;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }
  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (body.userId === user.id) {
    return NextResponse.json({ error: "You can't block yourself." }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_blocks")
    .upsert(
      { owner_id: user.id, blocked_user_id: body.userId },
      { onConflict: "owner_id,blocked_user_id" }
    );

  if (error) {
    return NextResponse.json({ error: "Could not block that user." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const limited = await checkRateLimit(req, "guestbook-unblock", 30, 60_000);
  if (limited) return limited;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("owner_id", user.id)
    .eq("blocked_user_id", userId);

  if (error) {
    return NextResponse.json({ error: "Could not unblock." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
