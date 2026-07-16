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
  // A single Discover mount legitimately bursts ~18 subject-cover lookups, so
  // this is generous. Results are cached client-side to avoid repeat bursts.
  const limited = await checkRateLimit(req, "den-books", 200, 60_000);
  if (limited) return limited;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const topic = req.nextUrl.searchParams.get("topic")?.trim();
  const pageRaw = req.nextUrl.searchParams.get("page");
  const page = pageRaw && /^\d+$/.test(pageRaw) ? Math.min(50, +pageRaw) : 1;
  if (!q && !topic) return NextResponse.json({ results: [], hasMore: false });

  // `topic` filters by Gutenberg bookshelf/subject (Browse by subject); `search`
  // matches titles + author names.
  const param = topic
    ? `topic=${encodeURIComponent(topic)}`
    : `search=${encodeURIComponent(q!)}`;

  let upstream: Response;
  try {
    upstream = await fetch(`https://gutendex.com/books?${param}&page=${page}`, {
      next: { revalidate: 3600 },
    });
  } catch {
    return NextResponse.json({ error: "Book search is unavailable." }, { status: 502 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: "Book search failed." }, { status: 502 });
  }

  const data = (await upstream.json()) as {
    results?: GutendexBook[];
    next?: string | null;
  };
  const results = (data.results ?? []).map((b) => ({
    source: "gutenberg",
    externalId: String(b.id),
    title: b.title,
    author: b.authors[0]?.name ?? null,
    coverUrl: b.formats["image/jpeg"] ?? null,
  }));

  return NextResponse.json({ results, hasMore: Boolean(data.next) });
}
