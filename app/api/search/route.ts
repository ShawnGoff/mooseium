// GET /api/search?museum=met&q=...&page=1 — proxy + normalize search.
// museum=all fans out to every enabled museum and merges the results.
// The browser always calls this, never a museum directly (hides keys, keeps
// responses same-origin, and enforces has-image + open-access).

import { NextRequest, NextResponse } from "next/server";
import { getAdapter, listMuseums } from "@/lib/museums";
import type { ArtworkCard } from "@/lib/museums/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { decodeEntities } from "@/lib/util/text";

function clean(cards: ArtworkCard[]): ArtworkCard[] {
  return cards.map((c) => ({
    ...c,
    title: decodeEntities(c.title),
    artist: decodeEntities(c.artist),
    dateText: decodeEntities(c.dateText),
    objectType: decodeEntities(c.objectType),
  }));
}

export async function GET(req: NextRequest) {
  // Protect upstream museum APIs (esp. Harvard's daily cap): 40 searches/min/IP.
  const limited = await checkRateLimit(req, "search", 40, 60_000);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const museum = searchParams.get("museum") ?? "";
  const query = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const pageSize = Math.min(Number(searchParams.get("pageSize") ?? "24") || 24, 50);

  // --- Cross-museum search: fan out to every enabled museum and interleave. ---
  if (museum === "all") {
    const slugs = listMuseums().map((m) => m.slug);
    const per = Math.max(4, Math.ceil(pageSize / Math.max(1, slugs.length)));

    const settled = await Promise.allSettled(
      slugs.map((slug) => {
        const adapter = getAdapter(slug);
        if (!adapter) return Promise.resolve(null);
        return adapter.search({
          query,
          filters: {},
          page,
          pageSize: per,
          hasImage: true,
          openAccessOnly: true,
        });
      })
    );

    const lists: ArtworkCard[][] = [];
    let hasMore = false;
    let total = 0;
    for (const r of settled) {
      if (r.status !== "fulfilled" || !r.value) continue;
      lists.push(r.value.cards.filter((c) => c.thumbnailUrl));
      if (r.value.hasMore) hasMore = true;
      if (typeof r.value.total === "number") total += r.value.total;
    }

    // Round-robin merge so results are mixed across museums, not grouped.
    const merged: ArtworkCard[] = [];
    const maxLen = lists.reduce((m, l) => Math.max(m, l.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const l of lists) if (l[i]) merged.push(l[i]);
    }

    return NextResponse.json(
      {
        cards: clean(merged),
        page,
        pageSize: merged.length,
        total,
        hasMore,
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  }

  // --- Single-museum search. ---
  const adapter = getAdapter(museum);
  if (!adapter) {
    return NextResponse.json(
      { error: `Unknown museum: ${museum || "(none)"}` },
      { status: 400 }
    );
  }

  // Any remaining query params (except the reserved ones) are museum-specific filters.
  const reserved = new Set(["museum", "q", "page", "pageSize"]);
  const filters: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (!reserved.has(key)) filters[key] = value;
  }

  try {
    const result = await adapter.search({
      query,
      filters,
      page,
      pageSize,
      hasImage: true,
      openAccessOnly: true,
    });
    result.cards = clean(result.cards);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.error("Search failed:", err);
    return NextResponse.json(
      { error: "Search failed. The museum API may be unavailable — try again." },
      { status: 502 }
    );
  }
}
