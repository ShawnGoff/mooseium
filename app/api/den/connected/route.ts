// GET /api/den/connected — "Because your museum has…" shelves.
// Reads the distinct artists across the signed-in user's saved artworks, then
// finds public-domain books by/about those names (their letters, biographies,
// writings). Ties the museum and the Den together.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

type GutendexBook = {
  id: number;
  title: string;
  authors: { name: string }[];
  formats: Record<string, string>;
};

const GENERIC = new Set([
  "unknown",
  "anonymous",
  "unidentified artist",
  "various",
  "unknown artist",
  "unknown maker",
]);

// "Vincent van Gogh (Dutch, 1853–1890)" -> "Vincent van Gogh"
function cleanName(raw: string): string {
  return raw.split("(")[0].replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "den-connected", 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ shelves: [] });

  const { data } = await supabase
    .from("saved_artworks")
    .select("artworks(artist)")
    .eq("user_id", user.id)
    .limit(300);

  // Count artist frequency, ignoring blanks/generic labels.
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as unknown as { artworks: { artist: string | null } | null }[]) {
    const raw = row.artworks?.artist;
    if (!raw) continue;
    const name = cleanName(raw);
    if (!name || GENERIC.has(name.toLowerCase())) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const topArtists = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  const shelves = await Promise.all(
    topArtists.map(async (artist) => {
      try {
        const r = await fetch(
          `https://gutendex.com/books?search=${encodeURIComponent(artist)}`,
          { next: { revalidate: 86400 } },
        );
        if (!r.ok) return null;
        const d = (await r.json()) as { results?: GutendexBook[] };
        const books = (d.results ?? []).slice(0, 8).map((b) => ({
          source: "gutenberg",
          externalId: String(b.id),
          title: b.title,
          author: b.authors[0]?.name ?? null,
          coverUrl: b.formats["image/jpeg"] ?? null,
        }));
        return books.length ? { artist, books } : null;
      } catch {
        return null;
      }
    }),
  );

  return NextResponse.json({ shelves: shelves.filter(Boolean) });
}
