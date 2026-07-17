// Shared headers for calls to the Gutendex API (gutendex.com). Gutendex sits
// behind Cloudflare, which blocks header-less requests from datacenter IPs
// (like Vercel's) as suspected bots — so every server-side Gutendex fetch must
// send a real User-Agent, or it silently comes back empty.
export const GUTENDEX_HEADERS: Record<string, string> = {
  "User-Agent":
    "MooseiumBot/1.0 (+https://mooseium.com; public-domain book discovery)",
  Accept: "application/json",
};
