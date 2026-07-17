// GET /api/den/books/popular — the most-read public-domain books.
// Gutendex returns results sorted by download count by default, so page 1 is
// effectively "most popular". No params needed.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { GUTENDEX_HEADERS } from "@/lib/gutendex";

type GutendexBook = {
  id: number;
  title: string;
  authors: { name: string }[];
  formats: Record<string, string>;
};

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "den-popular", 60, 60_000);
  if (limited) return limited;

  let upstream: Response;
  try {
    upstream = await fetch("https://gutendex.com/books", {
      headers: GUTENDEX_HEADERS,
      next: { revalidate: 21600 }, // cache 6h
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
  if (!upstream.ok) return NextResponse.json({ results: [] });

  const data = (await upstream.json()) as { results?: GutendexBook[] };
  const results = (data.results ?? [])
    .filter((b) => b.formats["image/jpeg"]) // keep ones with a cover
    .slice(0, 18)
    .map((b) => ({
      source: "gutenberg",
      externalId: String(b.id),
      title: b.title,
      author: b.authors[0]?.name ?? null,
      coverUrl: b.formats["image/jpeg"] ?? null,
    }));

  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "public, max-age=21600" } },
  );
}
