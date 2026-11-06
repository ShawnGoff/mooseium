// GET /api/den/books/content?gid=<gutenberg id> — the illustrated reading view.
// Fetches Gutenberg's HTML (with original images), strips the legal boilerplate,
// sanitizes it, and rewrites relative image URLs to absolute so they load.

import { NextRequest, NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { checkRateLimit } from "@/lib/rate-limit";
import { GUTENDEX_HEADERS, isGutenbergUrl, fetchGutenberg } from "@/lib/gutendex";

type GutendexBook = {
  title: string;
  formats: Record<string, string>;
};

// isGutenbergUrl keeps the defense-in-depth check on the second-hop URL from
// Gutendex's response, so a poisoned response can't steer our fetch. It now
// lives in lib/gutendex.ts, where fetchGutenberg applies the same test to each
// redirect — the hop that used to go unchecked.
async function tryFetch(url: string): Promise<{ raw: string; finalUrl: string } | null> {
  const got = await fetchGutenberg(url);
  if (!got || !got.res.ok) return null;
  try {
    const raw = await got.res.text();
    if (!raw || raw.length < 200) return null;
    return { raw, finalUrl: got.finalUrl };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "den-book-content", 30, 60_000);
  if (limited) return limited;

  const gid = req.nextUrl.searchParams.get("gid")?.trim();
  if (!gid || !/^\d+$/.test(gid)) {
    return NextResponse.json({ error: "Bad book id." }, { status: 400 });
  }

  // Fetch the illustrated HTML DIRECTLY from gutenberg.org's predictable file
  // URLs — this doesn't depend on the (flaky) Gutendex metadata API.
  let got: { raw: string; finalUrl: string } | null = null;
  const direct = [
    `https://www.gutenberg.org/cache/epub/${gid}/pg${gid}-images.html`,
    `https://www.gutenberg.org/cache/epub/${gid}/pg${gid}.html`,
    `https://www.gutenberg.org/files/${gid}/${gid}-h/${gid}-h.htm`,
  ];
  for (const url of direct) {
    got = await tryFetch(url);
    if (got) break;
  }

  // Fallback: resolve the URL via Gutendex if the direct paths didn't exist.
  if (!got) {
    try {
      const mr = await fetch(`https://gutendex.com/books/${gid}`, {
        headers: GUTENDEX_HEADERS,
        next: { revalidate: 86400 },
      });
      if (mr.ok) {
        const meta = (await mr.json()) as GutendexBook;
        const htmlUrl = Object.entries(meta.formats ?? {}).find(
          ([type, url]) => type.startsWith("text/html") && !url.endsWith(".zip"),
        )?.[1];
        if (htmlUrl && isGutenbergUrl(htmlUrl)) got = await tryFetch(htmlUrl);
      }
    } catch {
      /* ignore */
    }
  }

  if (!got) {
    return NextResponse.json(
      { error: "No illustrated version for this book." },
      { status: 415 },
    );
  }
  const { raw, finalUrl } = got;

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

  const titleMatch = /<title>([^<]+)<\/title>/i.exec(raw);
  const title = titleMatch
    ? titleMatch[1].replace(/\s*[|·-]\s*Project Gutenberg.*/i, "").trim()
    : null;

  return NextResponse.json(
    { title, html: clean },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
