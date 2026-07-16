// GET /api/den/books/search?q=... — search Project Gutenberg via Gutendex.
// Public-domain books only; no API key needed. Returns a normalized shape the
// Den can save into den_books.

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

type GutendexBook = {
  id: number;
  title: string;
  authors: { name: string }[];
  formats: Record<string, string>;
};

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "den-books", 60, 60_000);
  if (limited) return limited;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://gutendex.com/books?search=${encodeURIComponent(q)}`,
      { next: { revalidate: 3600 } },
    );
  } catch {
    return NextResponse.json({ error: "Book search is unavailable." }, { status: 502 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: "Book search failed." }, { status: 502 });
  }

  const data = (await upstream.json()) as { results?: GutendexBook[] };
  const results = (data.results ?? []).slice(0, 16).map((b) => ({
    source: "gutenberg",
    externalId: String(b.id),
    title: b.title,
    author: b.authors[0]?.name ?? null,
    coverUrl: b.formats["image/jpeg"] ?? null,
  }));

  return NextResponse.json({ results });
}
