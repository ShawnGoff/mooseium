// lib/rate-limit.ts
// Fixed-window rate limiter with two backends:
//   • Upstash Redis (shared across all Vercel instances) when UPSTASH_REDIS_REST_URL
//     + UPSTASH_REDIS_REST_TOKEN are set — this is the real, distributed limit.
//   • An in-memory fallback (per-instance) when they're absent or Redis errors,
//     so local dev and a Redis outage still degrade gracefully rather than break.
// To enable the distributed limit: create a free Upstash Redis DB and paste its
// REST URL + token into the Vercel environment. No code change needed.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * @param key     unique key (e.g. `${ip}:search`)
 * @param limit   max requests per window
 * @param windowMs window length in ms
 */
// Periodically drop expired buckets so the map can't grow without bound.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    sweep(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "anon";
}

// Distributed fixed-window limit via the Upstash Redis REST API. Returns null
// (so the caller falls back to the in-memory limiter) if Upstash isn't
// configured or is unreachable — i.e. we fail OPEN, never blocking real users
// because Redis hiccuped.
async function upstashLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const now = Date.now();
  const seconds = Math.max(1, Math.ceil(windowMs / 1000));
  const window = Math.floor(now / windowMs);
  const rkey = `rl:${key}:${window}`;
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      // INCR the window counter; set its TTL only on first hit (EXPIRE ... NX).
      body: JSON.stringify([
        ["INCR", rkey],
        ["EXPIRE", rkey, seconds, "NX"],
      ]),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: number }[];
    const count = Number(data?.[0]?.result ?? 0);
    if (!count) return null;
    if (count > limit) {
      return {
        ok: false,
        remaining: 0,
        retryAfterSec: Math.ceil(((window + 1) * windowMs - now) / 1000),
      };
    }
    return { ok: true, remaining: limit - count, retryAfterSec: 0 };
  } catch {
    return null;
  }
}

/** Convenience: check a limit and return a 429 Response if exceeded, else null. */
export async function checkRateLimit(
  req: Request,
  name: string,
  limit: number,
  windowMs: number
): Promise<Response | null> {
  const key = `${clientIp(req)}:${name}`;
  const result =
    (await upstashLimit(key, limit, windowMs)) ?? rateLimit(key, limit, windowMs);
  if (result.ok) return null;
  return new Response(
    JSON.stringify({ error: "Too many requests — please slow down a moment." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec),
      },
    }
  );
}
