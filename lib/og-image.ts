// Fetching museum art for Open Graph cards.
//
// Shared by the opengraph-image routes. It used to be three byte-identical
// copies of the same function, which meant the bug below existed three times.
//
// The renderer behind next/og is satori, and satori decodes JPEG, PNG and GIF
// only — it cannot read WebP or AVIF. The old code asked CDNs to *prefer*
// exactly those two formats, then accepted the response because "image/webp"
// passes a `startsWith("image/")` check. The decoder then tried JPEG on WebP
// bytes and threw "Invalid JPEG", which surfaced as "failed to pipe response"
// and a 500 on /g/[slug]/opengraph-image — so shared gallery links rendered no
// preview card at all on social.
//
// Two changes stop that: ask only for formats satori can read, and verify the
// bytes rather than trusting the content-type header, since a CDN is free to
// mislabel a response (or hand back an HTML error page as "image/jpeg", which
// the Art Institute's datacenter-IP blocking does).

import { isAllowedMuseumImage } from "@/lib/museum-image";

// Only what satori can actually decode. Deliberately no avif/webp.
const OG_ACCEPT = "image/jpeg,image/png,image/gif;q=0.9,*/*;q=0.1";

// Keep a card's four frames from ballooning the response. Base64 inflates by
// ~33%, and the whole OG image has to render inside the function's time budget.
const MAX_BYTES = 3 * 1024 * 1024;

// Identify the format from its leading bytes. Content-type is a claim; this is
// evidence. Returns null for anything satori cannot render.
function sniffImageType(buf: Buffer): "image/jpeg" | "image/png" | "image/gif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return "image/gif";
  }
  // Explicitly recognised and rejected: RIFF....WEBP and the ISO-BMFF ftyp
  // box AVIF uses. Both are real images and both crash the renderer, so they
  // are dropped here rather than being allowed to reach it.
  return null;
}

/**
 * Fetch a museum image and return it as a data URL satori can render, or null.
 *
 * Null is always a safe answer: every caller falls back to a text-only card,
 * which is far better than a 500 and no preview at all.
 */
export async function toDataUrl(url: string): Promise<string | null> {
  if (!isAllowedMuseumImage(url)) return null;
  try {
    const origin = new URL(url).origin;
    const r = await fetch(url, {
      headers: {
        // Some museum CDNs refuse requests without a browser-shaped UA.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: OG_ACCEPT,
        Referer: `${origin}/`,
      },
    });
    if (!r.ok) return null;

    // Cheap rejection before reading the body, when the CDN declares a length.
    const declared = Number(r.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) return null;

    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return null;

    // The header is not consulted on purpose — the bytes decide.
    const type = sniffImageType(buf);
    if (!type) return null;

    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
