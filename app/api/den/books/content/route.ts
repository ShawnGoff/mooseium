// GET /api/den/books/content?gid=<gutenberg id> — the illustrated reading view.
// Fetches Gutenberg's HTML (with original images), strips the legal boilerplate,
// sanitizes it, and rewrites relative image URLs to absolute so they load.

import { NextRequest, NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { checkRateLimit } from "@/lib/rate-limit";

type GutendexBook = {
  title: string;
  formats: Record<string, string>;
};

// Defense-in-depth: even the second-hop URL (from Gutendex's response) must be
// an https Gutenberg host, so a poisoned response can't steer our fetch.
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

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "den-book-content", 30, 60_000);
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

  // Prefer an HTML format (has the illustrations); skip zip archives.
  const htmlUrl = Object.entries(meta.formats).find(
    ([type, url]) => type.startsWith("text/html") && !url.endsWith(".zip"),
  )?.[1];

  if (!htmlUrl || !isGutenbergUrl(htmlUrl)) {
    return NextResponse.json(
      { error: "No illustrated version for this book." },
      { status: 415 },
    );
  }

  let raw: string;
  let finalUrl: string;
  try {
    const r = await fetch(htmlUrl, { redirect: "follow", next: { revalidate: 86400 } });
    if (!r.ok) throw new Error();
    raw = await r.text();
    finalUrl = r.url || htmlUrl;
  } catch {
    return NextResponse.json({ error: "Could not load the book." }, { status: 502 });
  }

  const base = finalUrl.slice(0, finalUrl.lastIndexOf("/") + 1);

  const clean = sanitizeHtml(raw, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "blockquote",
      "i", "b", "em", "strong", "small", "sub", "sup", "u", "span", "div",
      "img", "figure", "figcaption", "ul", "ol", "li", "pre", "table",
      "thead", "tbody", "tr", "td", "th", "a",
    ],
    allowedAttributes: {
      img: ["src", "alt", "width", "height", "loading"],
      a: ["href"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "data"],
    // Drop Project Gutenberg's header/footer boilerplate blocks.
    exclusiveFilter: (frame) =>
      /pg-?boilerplate|pgheader|pgfooter|pg-?menu/i.test(frame.attribs.class || ""),
    transformTags: {
      img: (tagName, attribs) => {
        let src = attribs.src || "";
        if (src && !/^(https?:|data:)/i.test(src)) {
          try {
            src = new URL(src, base).href;
          } catch {
            src = "";
          }
        }
        return { tagName: "img", attribs: { ...attribs, src, loading: "lazy" } };
      },
      // Neutralize internal anchors — links shouldn't navigate away mid-read.
      a: () => ({ tagName: "span", attribs: {} }),
    },
  });

  return NextResponse.json(
    { title: meta.title, html: clean },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
