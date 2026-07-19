// GET /api/den/shelves?surface=library — the cached discovery shelves.
// Returns the global shelves for the surface, plus the signed-in user's own
// personalized shelves (if any) first. RLS already limits which rows come back,
// so we just split them here. No LLM call happens on read — this is pure cache.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ShelfDef = { title: string; blurb: string; query: string };

export async function GET(req: NextRequest) {
  const surface =
    req.nextUrl.searchParams.get("surface") === "museum" ? "museum" : "library";

  const supabase = await createClient();
  const { data } = await supabase
    .from("discover_shelves")
    .select("shelves, user_id")
    .eq("surface", surface);

  const rows = (data ?? []) as { shelves: ShelfDef[] | null; user_id: string | null }[];
  // Personalized shelves (user_id set) lead; global shelves follow.
  const personalized = rows.filter((r) => r.user_id).flatMap((r) => r.shelves ?? []);
  const global = rows.filter((r) => !r.user_id).flatMap((r) => r.shelves ?? []);

  return NextResponse.json({ shelves: [...personalized, ...global] });
}
