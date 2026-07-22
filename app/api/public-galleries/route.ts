// GET /api/public-galleries — recently updated public galleries, for the
// homepage discovery feed. Works signed out (RLS allows reading public rows).
// The /galleries page calls the same helper directly so its links are
// server-rendered and crawlable.

import { NextResponse } from "next/server";
import { fetchPublicGalleries } from "@/lib/public-galleries";

export async function GET() {
  const galleries = await fetchPublicGalleries(12);
  return NextResponse.json({ galleries });
}
