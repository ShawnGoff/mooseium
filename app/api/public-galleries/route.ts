// GET /api/public-galleries — recently updated public galleries, for the
// homepage discovery feed. Works signed out (RLS allows reading public rows).
// The /galleries page calls the same helper directly so its links are
// server-rendered and crawlable.

import { NextResponse } from "next/server";
import { fetchPublicGalleries } from "@/lib/public-galleries";
import { publicCache } from "@/lib/http-cache";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  // Takes no parameters, so the CDN absorbs normal traffic; this only catches
  // someone appending junk query strings to force misses.
  const limited = await checkRateLimit(req, "public-galleries", 60, 60_000);
  if (limited) return limited;

  const galleries = await fetchPublicGalleries(12);
  return NextResponse.json({ galleries }, { headers: publicCache(60) });
}
