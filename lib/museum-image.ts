// Airtight host allowlist for museum image URLs, shared by the image proxy and
// the OG-image routes. A raw regex on the URL string can be fooled by userinfo
// or port tricks — e.g. `https://metmuseum.org:x@attacker.com/p.jpg` matches a
// naive `metmuseum\.org` pattern but actually resolves to attacker.com. So we
// PARSE the URL and check the resolved hostname (which ignores userinfo/port).
const ALLOWED_DOMAINS = [
  "metmuseum.org",
  "artic.edu",
  "clevelandart.org",
  "micr.io",
  "harvard.edu",
  "harvardartmuseums.org",
  "si.edu",
  "vam.ac.uk",
];

// Our own Supabase host, so the proxy will also serve images we've cached into
// the artwork-images bucket (see 0030_artwork_image_cache.sql). Derived from the
// configured project URL rather than hardcoding "supabase.co", which would let
// the proxy fetch from ANY Supabase project, not just ours.
function cacheHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isAllowedMuseumImage(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === cacheHost()) return true;
  return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith("." + d));
}

// Museums whose images CANNOT reach a visitor unless we have cached a copy.
//
// Two things have to fail for a piece to render blank. /api/img runs on Vercel,
// and some museum CDNs refuse datacenter IPs — measured against production:
//
//   met 200 · cleveland 200 · smithsonian 200 · harvard 502 · artic 502
//
// Harvard 502s too, but sends CORS headers, so ProxyArtwork's direct-from-museum
// fallback rescues it in the browser. The Art Institute refuses that path as
// well, leaving no route at all — those pieces fall back to a title card.
//
// So this list is "blocked at BOTH hops", not "blocked at the proxy". Anything
// here must be cached by scripts/cache-artwork-images.mjs (run from a normal
// connection — Vercel is the blocked party) or it will not display.
export const MUSEUMS_NEEDING_CACHE = ["artic"];
