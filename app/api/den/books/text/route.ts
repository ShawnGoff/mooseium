// GET /api/den/books/text?gid=<gutenberg id> — fetch a book's plain text.
// Resolves the text URL via Gutendex, downloads it, and trims Project
// Gutenberg's legal header/footer so the reader shows just the work.

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { GUTENDEX_HEADERS } from "@/lib/gutendex";

type GutendexBook = {
  title: string;
  formats: Record<string, string>;
};

// Defense-in-depth: the text URL from Gutendex must be an https Gutenberg host.
function isGutenbergUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return (
      url.protocol === "https:" &&
      (url.hostname === "gutenberg.org" || url.hostname.endsWith(".gutenberg.org"))
    );
  } catch {
    return false;
  }
}

function stripBoilerplate(text: string): string {
  const startRe = /\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG.*?\*\*\*/i;
  const endRe = /\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG.*?\*\*\*/i;
  const s = text.search(startRe);
  const e = text.search(endRe);
  let out = text;
  if (s !== -1) {
    const nl = text.indexOf("\n", s);
    out = text.slice(nl === -1 ? s : nl + 1);
  }
  if (e !== -1) {
    const eInOut = out.search(endRe);
    if (eInOut !== -1) out = out.slice(0, eInOut);
  }
  return out.trim();
}

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "den-book-text", 30, 60_000);
  if (limited) return limited;

  const gid = req.nextUrl.searchParams.get("gid")?.trim();
  if (!gid || !/^\d+$/.test(gid)) {
    return NextResponse.json({ error: "Bad book id." }, { status: 400 });
  }

  // Fetch the plain text DIRECTLY from gutenberg.org's predictable file URLs so
  // reading doesn't depend on the (flaky) Gutendex metadata API.
  const direct = [
    `https://www.gutenberg.org/cache/epub/${gid}/pg${gid}.txt`,
    `https://www.gutenberg.org/files/${gid}/${gid}-0.txt`,
    `https://www.gutenberg.org/files/${gid}/${gid}.txt`,
  ];

  let raw: string | null = null;
  for (const url of direct) {
    try {
      const r = await fetch(url, { redirect: "follow", next: { revalidate: 86400 } });
      if (!r.ok) continue;
      const type = r.headers.get("content-type") || "";
      const m = /charset=([\w-]+)/i.exec(type);
      const charset = (m?.[1] || "utf-8").toLowerCase();
      const buf = await r.arrayBuffer();
      let decoded: string;
      try {
        decoded = new TextDecoder(charset).decode(buf);
      } catch {
        decoded = new TextDecoder("utf-8").decode(buf);
      }
      if (decoded && decoded.length > 200) {
        raw = decoded;
        break;
      }
    } catch {
      /* try next */
    }
  }

  // Fallback: resolve the text URL via Gutendex if the direct paths failed.
  if (!raw) {
    try {
      const mr = await fetch(`https://gutendex.com/books/${gid}`, {
        headers: GUTENDEX_HEADERS,
        next: { revalidate: 86400 },
      });
      if (mr.ok) {
        const meta = (await mr.json()) as GutendexBook;
        const plain = Object.entries(meta.formats ?? {}).filter(
          ([type, url]) => type.startsWith("text/plain") && !url.endsWith(".zip"),
        );
        const chosen = plain.find(([type]) => /utf-8/i.test(type)) ?? plain[0];
        const textUrl = chosen?.[1];
        if (textUrl && isGutenbergUrl(textUrl)) {
          const r = await fetch(textUrl, { next: { revalidate: 86400 } });
          if (r.ok) raw = await r.text();
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (!raw) {
    return NextResponse.json({ error: "Could not load the text." }, { status: 502 });
  }

  return NextResponse.json(
    { title: null, text: stripBoilerplate(raw) },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
