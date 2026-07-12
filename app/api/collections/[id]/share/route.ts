// POST /api/collections/[id]/share  { public: boolean }
// Publishes or unpublishes a gallery. Publishing sets is_public and generates a
// stable share_slug (kept on unpublish so the same link works if re-published).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";

function genSlug(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await checkRateLimit(req, "collection-share", 20, 60_000);
  if (limited) return limited;
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  let body: { public?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const makePublic = body.public !== false; // default to publishing

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("galleries")
    .select("share_slug")
    .eq("id", id)
    .single();

  const slug = existing?.share_slug ?? (makePublic ? genSlug() : null);

  const { error } = await supabase
    .from("galleries")
    .update({
      is_public: makePublic,
      share_slug: slug,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Could not update sharing." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, isPublic: makePublic, slug });
}
