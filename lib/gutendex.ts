// Shared headers for calls to the Gutendex API (gutendex.com). Gutendex sits
// behind Cloudflare, which blocks header-less requests from datacenter IPs
// (like Vercel's) as suspected bots — so every server-side Gutendex fetch must
// send a real User-Agent, or it silently comes back empty.
export const GUTENDEX_HEADERS: Record<string, string> = {
  "User-Agent":
    "MooseiumBot/1.0 (+https://mooseium.com; public-domain book discovery)",
  Accept: "application/json",
};

/** An https URL on gutenberg.org or one of its subdomains. */
export function isGutenbergUrl(u: string): boolean {
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

// Fetch from Project Gutenberg, re-checking the host at every redirect.
//
// Lower stakes than the image proxy, where the caller hands in a whole URL: here
// the only user input is a numeric book id dropped into hardcoded gutenberg.org
// paths, so nobody can aim this at a host of their choosing. The hole it closes
// is narrower — gutenberg.org redirecting somewhere unexpected — but the reading
// routes already validated the second-hop URL they get from Gutendex for exactly
// this reason, and a redirect is just another hop that was going unchecked.
//
// Returns the final URL alongside the response because the illustrated reader
// resolves relative <img> paths against it, and with manual redirects Response.url
// no longer tracks where we actually ended up.
export async function fetchGutenberg(
  url: string,
  revalidate = 86400
): Promise<{ res: Response; finalUrl: string } | null> {
  if (!isGutenbergUrl(url)) return null;

  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    let res: Response;
    try {
      res = await fetch(current, { redirect: "manual", next: { revalidate } });
    } catch {
      return null;
    }

    if (res.status < 300 || res.status > 399) return { res, finalUrl: current };

    const location = res.headers.get("location");
    if (!location) return { res, finalUrl: current };

    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      return null;
    }
    if (!isGutenbergUrl(next)) return null;
    current = next;
  }
  return null; // too many hops
}
