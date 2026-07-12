// GET /api/museums — the list of searchable museums (+ their filter fields)
// for the search dropdown.

import { NextResponse } from "next/server";
import { listMuseums } from "@/lib/museums";

export function GET() {
  return NextResponse.json({ museums: listMuseums() });
}
