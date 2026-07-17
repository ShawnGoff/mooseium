// GET /api/den/books/search?q=... — search Project Gutenberg via Gutendex.
// Public-domain books only; no API key needed. Returns a normalized shape the
// Den can save into den_books.

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { GUTENDEX_HEADERS } from "@/lib/gutendex";

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

  // Only add page for "load more" — page 1 uses the bare URL that worked before.
  const pageParam = page > 1 ? `&page=${page}` : "";

  const norm = (b: GutendexBook) => ({
    source: "gutenberg",
    externalId: String(b.id),
    title: b.title,
    author: b.authors[0]?.name ?? null,
    coverUrl: b.formats["image/jpeg"] ?? null,
  });

  // Fetch one Gutendex query; returns null on any upstream/network failure.
  async function fetchGutendex(param: string) {
    try {
      const r = await fetch(`https://gutendex.com/books?${param}${pageParam}`, {
        headers: GUTENDEX_HEADERS,
        next: { revalidate: 3600 },
      });
      if (!r.ok) return null;
      const d = (await r.json()) as { results?: GutendexBook[]; next?: string | null };
      return { results: (d.results ?? []).map(norm), hasMore: Boolean(d.next) };
    } catch {
      return null;
    }
  }

  // `topic` filters by Gutenberg bookshelf/subject (Browse by subject); `search`
  // matches titles + author names. If a subject topic yields nothing (Gutendex
  // bookshelf names drift), fall back to a keyword search so the shelf isn't
  // empty.
  let out = topic
    ? await fetchGutendex(`topic=${encodeURIComponent(topic)}`)
    : await fetchGutendex(`search=${encodeURIComponent(q!)}`);

  if (topic && (!out || out.results.length === 0)) {
    const fallback = await fetchGutendex(`search=${encodeURIComponent(topic)}`);
    if (fallback && fallback.results.length > 0) out = fallback;
  }

  if (!out) {
    return NextResponse.json({ error: "Book search is unavailable." }, { status: 502 });
  }
  return NextResponse.json(out);
}
