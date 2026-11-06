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

// Fetch an image, checking the allowlist at EVERY hop rather than only the
// first one.
//
// Validating only the URL handed in is not enough once redirects are followed.
// The allowlist admits whole domain suffixes — any *.harvard.edu, for one — and
// a single open redirect anywhere on an institution that size turns this into a
// proxy for arbitrary hosts. The caller checks the first URL; without this, the
// museum's own CDN chooses the rest.
//
// Refusing redirects outright would be simpler and would break real images:
// nrs.harvard.edu is a persistent-identifier resolver whose job is to redirect,
// and CDNs hop within their own domains. So we follow them, and apply the same
// test to each destination. That also means the broad suffixes stay safe: a
// redirect from harvard.edu to another Harvard host is fine, one to anywhere
// else fails the check.
//
// Returns null when a hop leaves the allowlist, when the chain is too long, or
// on a network error, so callers fall through to whatever fallback they have.
export async function fetchAllowedImage(
  url: string,
  headers: Record<string, string>,
  revalidate?: number
): Promise<Response | null> {
  if (!isAllowedMuseumImage(url)) return null;

  let current = url;
  // Four is generous for a resolver plus a CDN hop or two, and bounds a
  // redirect loop that would otherwise tie up a serverless invocation.
  for (let hop = 0; hop < 4; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        headers,
        // The point of the whole function: take the redirect ourselves instead
        // of letting fetch follow it unchecked.
        redirect: "manual",
        ...(revalidate === undefined ? {} : { next: { revalidate } }),
      });
    } catch {
      return null;
    }

    if (res.status < 300 || res.status > 399) return res;

    const location = res.headers.get("location");
    if (!location) return res;

    // Resolve against the current URL: redirects are allowed to be relative,
    // and a relative hop stays on a host we have already cleared.
    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      return null;
    }
    if (!isAllowedMuseumImage(next)) return null; // the case this exists for
    current = next;
  }
  return null; // too many hops
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
