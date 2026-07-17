// GET /api/den/books/detail?gid=<gutenberg id> — placard info for a book.
// Gutenberg supplies subjects + popularity; Open Library supplies a description
// (Gutendex has none). Metadata only — no lending, no full text here.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { GUTENDEX_HEADERS } from "@/lib/gutendex";

type Gutendex = {
  title: string;
  authors: { name: string }[];
  subjects?: string[];
  download_count?: number;
};

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "den-detail", 60, 60_000);
  if (limited) return limited;

  const gid = req.nextUrl.searchParams.get("gid")?.trim();
  if (!gid || !/^\d+$/.test(gid)) {
    return NextResponse.json({ error: "Bad id." }, { status: 400 });
  }

  let meta: Gutendex;
  try {
    const r = await fetch(`https://gutendex.com/books/${gid}`, {
      headers: GUTENDEX_HEADERS,
      next: { revalidate: 86400 },
    });
    if (!r.ok) throw new Error();
    meta = (await r.json()) as Gutendex;
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Gutenberg subjects look like "Whaling -- Fiction"; take the leading term.
  const subjects = Array.from(
    new Set((meta.subjects ?? []).map((s) => s.split(" -- ")[0].trim())),
  )
    .filter(Boolean)
    .slice(0, 6);

  // Open Library description (best-effort; failures just omit it).
  let description: string | null = null;
  try {
    const author = meta.authors[0]?.name ?? "";
    const params = new URLSearchParams({ title: meta.title, limit: "1" });
    if (author) params.set("author", author);
    const sr = await fetch(
      `https://openlibrary.org/search.json?${params}&fields=key,first_sentence`,
      { next: { revalidate: 86400 } },
    );
    if (sr.ok) {
      const sd = (await sr.json()) as {
        docs?: { key?: string; first_sentence?: string[] | { value: string } }[];
      };
      const doc = sd.docs?.[0];
      const fs = doc?.first_sentence;
      if (Array.isArray(fs)) description = fs[0] ?? null;
      else if (fs && typeof fs === "object") description = fs.value ?? null;
      if (!description && doc?.key) {
        const wr = await fetch(`https://openlibrary.org${doc.key}.json`, {
          next: { revalidate: 86400 },
        });
        if (wr.ok) {
          const w = (await wr.json()) as { description?: string | { value: string } };
          const d = w.description;
          description = typeof d === "string" ? d : (d?.value ?? null);
        }
      }
    }
  } catch {
    /* no description */
  }

  if (description) {
    // Trim Open Library's trailing source notes (often "([source][1])").
    description = description.split(/\n\s*[-([]/)[0].trim().slice(0, 900);
  }

  return NextResponse.json(
    { subjects, downloads: meta.download_count ?? null, description },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
