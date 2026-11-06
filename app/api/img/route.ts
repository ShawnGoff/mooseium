// GET /api/img?url=<museum image url>
// Same-origin image proxy so WebGL/3D can use museum images as textures even
// when the museum CDN doesn't send CORS headers. Locked to known museum image
// hosts so it can't be used as an open proxy (SSRF-safe), and only passes
// through actual image responses. Cached a day.

import { NextRequest, NextResponse } from "next/server";
import { isAllowedMuseumImage, fetchAllowedImage } from "@/lib/museum-image";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  // A page can request many images at once, but this caps a single IP from
  // hammering the proxy to run up egress or abuse the museum CDNs.
  const limited = await checkRateLimit(req, "img", 300, 60_000);
  if (limited) return limited;

  const url = req.nextUrl.searchParams.get("url");
  if (!url || !isAllowedMuseumImage(url)) {
    return NextResponse.json({ error: "Unsupported image source." }, { status: 400 });
  }

  // Bound oversized IIIF originals (Harvard's full-size images are huge and fail
  // to decode on phone GPUs) to a sane max dimension.
  const target = url.replace(/\/full\/(?:full|max)\//i, "/full/!2000,2000/");

  // Some museum CDNs (e.g. the Art Institute) reject plain server-side requests
  // that don't look like a browser. Send a real User-Agent + a same-origin
  // Referer so hotlink protection lets the image through.
  let origin = "";
  try {
    origin = new URL(target).origin;
  } catch {
    return NextResponse.json({ error: "Bad url." }, { status: 400 });
  }

  // Redirects are re-checked against the allowlist at every hop — the museum's
  // CDN does not get to pick the final host. See fetchAllowedImage.
  const load = (u: string, withReferer: boolean) =>
    fetchAllowedImage(
      u,
      {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        ...(withReferer ? { Referer: `${origin}/` } : {}),
      },
      86400
    );

  // Museum image URLs fail in a few predictable ways, so try progressively
  // looser variants rather than giving up on the first error:
  //   1. as stored
  //   2. IIIF without an explicit size (IIIF refuses to upscale, and plenty of
  //      Harvard scans are smaller than the width we asked for)
  //   3. without width/height params (Harvard's NRS/IDS "dynmc" URLs)
  //   4. without a Referer, in case hotlink protection rejects it
  const attempts: { url: string; referer: boolean }[] = [{ url: target, referer: true }];
  const iiifFull = target.replace(/\/full\/[^/]+\//, "/full/full/");
  if (iiifFull !== target) attempts.push({ url: iiifFull, referer: true });
  try {
    const u = new URL(target);
    if (u.searchParams.has("width") || u.searchParams.has("height")) {
      u.searchParams.delete("width");
      u.searchParams.delete("height");
      attempts.push({ url: u.toString(), referer: true });
    }
  } catch {
    /* target already validated above */
  }
  attempts.push({ url: target, referer: false });

  let upstream: Response | null = null;
  for (const a of attempts) {
    try {
      const res = await load(a.url, a.referer);
      // null means the chain left the allowlist, ran too long, or failed.
      if (res && res.ok && (res.headers.get("content-type") || "").startsWith("image/")) {
        upstream = res;
        break;
      }
    } catch {
      /* try the next variant */
    }
  }
  if (!upstream) {
    return NextResponse.json({ error: "Image unavailable." }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Not an image." }, { status: 415 });
  }

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
