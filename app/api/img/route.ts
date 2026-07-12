// GET /api/img?url=<museum image url>
// Same-origin image proxy so WebGL/3D can use museum images as textures even
// when the museum CDN doesn't send CORS headers. Locked to known museum image
// hosts so it can't be used as an open proxy (SSRF-safe), and only passes
// through actual image responses. Cached a day.

import { NextRequest, NextResponse } from "next/server";
import { isAllowedMuseumImage } from "@/lib/museum-image";
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

  // Some museum CDNs (e.g. the Art Institute) reject plain server-side requests
  // that don't look like a browser. Send a real User-Agent + a same-origin
  // Referer so hotlink protection lets the image through.
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    return NextResponse.json({ error: "Bad url." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: `${origin}/`,
      },
      next: { revalidate: 86400 },
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch image." }, { status: 502 });
  }
  if (!upstream.ok) {
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
