// GET /api/museums — the list of searchable museums (+ their filter fields)
// for the search dropdown.

import { NextResponse } from "next/server";
import { listMuseums } from "@/lib/museums";
import { publicCache } from "@/lib/http-cache";

export function GET() {
  // Which museums are wired up changes only on deploy.
  return NextResponse.json({ museums: listMuseums() }, { headers: publicCache(600) });
}
