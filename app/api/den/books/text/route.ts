// GET /api/den/books/text?gid=<gutenberg id> — fetch a book's plain text.
// Resolves the text URL via Gutendex, downloads it, and trims Project
// Gutenberg's legal header/footer so the reader shows just the work.

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

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

  let meta: GutendexBook;
  try {
    const r = await fetch(`https://gutendex.com/books/${gid}`, {
      next: { revalidate: 86400 },
    });
    if (!r.ok) throw new Error();
    meta = (await r.json()) as GutendexBook;
  } catch {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  // Prefer the UTF-8 plain-text format so accented text isn't mojibake; skip
  // zipped variants. Fall back to any plain-text format.
  const plain = Object.entries(meta.formats).filter(
    ([type, url]) => type.startsWith("text/plain") && !url.endsWith(".zip"),
  );
  const chosen =
    plain.find(([type]) => /utf-8/i.test(type)) ?? plain[0];
  const textUrl = chosen?.[1];

  if (!textUrl || !isGutenbergUrl(textUrl)) {
    return NextResponse.json(
      { error: "No readable text for this book." },
      { status: 415 },
    );
  }

  let raw: string;
  try {
    const r = await fetch(textUrl, { next: { revalidate: 86400 } });
    if (!r.ok) throw new Error();
    // Decode with the declared charset (Gutenberg has ISO-8859-1 texts too).
    const type = chosen?.[0] || r.headers.get("content-type") || "";
    const m = /charset=([\w-]+)/i.exec(type);
    const charset = (m?.[1] || "utf-8").toLowerCase();
    const buf = await r.arrayBuffer();
    try {
      raw = new TextDecoder(charset).decode(buf);
    } catch {
      raw = new TextDecoder("utf-8").decode(buf);
    }
  } catch {
    return NextResponse.json({ error: "Could not load the text." }, { status: 502 });
  }

  return NextResponse.json(
    { title: meta.title, text: stripBoilerplate(raw) },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
