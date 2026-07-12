// POST /api/report — flag a public gallery or guestbook entry for review.
// Body: { targetType: "gallery" | "guestbook", galleryId, subjectUserId?, reason, details? }

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";

const REASONS = new Set([
  "spam",
  "harassment",
  "explicit",
  "impersonation",
  "other",
]);

export async function POST(req: Request) {
  const limited = await checkRateLimit(req, "report", 20, 60_000);
  if (limited) return limited;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  let body: {
    targetType?: string;
    galleryId?: string;
    subjectUserId?: string;
    reason?: string;
    details?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const targetType = body.targetType;
  if (targetType !== "gallery" && targetType !== "guestbook") {
    return NextResponse.json({ error: "Invalid target." }, { status: 400 });
  }
  if (!body.galleryId) {
    return NextResponse.json({ error: "galleryId is required." }, { status: 400 });
  }
  const reason = (body.reason ?? "").toLowerCase();
  if (!REASONS.has(reason)) {
    return NextResponse.json({ error: "Choose a reason." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to report." }, { status: 401 });
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: targetType,
    gallery_id: body.galleryId,
    subject_user_id: body.subjectUserId ?? null,
    reason,
    details: (body.details ?? "").slice(0, 1000) || null,
  });

  if (error) {
    return NextResponse.json({ error: "Could not submit the report." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
