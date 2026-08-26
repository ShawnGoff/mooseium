// Cache headers for PUBLIC read endpoints.
//
// These routes are keyed entirely by a handle or slug — the same request returns
// the same bytes to everyone, signed in or not — so Vercel's edge can answer them
// without invoking the function at all. That is worth real time: /api/museum
// gates the whole 3D museum, and a cold start on it measured 2.3s against ~0.3s
// warm. A CDN hit skips both.
//
// Only use this where the response genuinely does not depend on the viewer. A
// handler that calls auth.getUser() and branches on it must NOT cache, or one
// visitor's answer is served to the next.
//
// s-maxage targets shared caches (the CDN) and leaves browsers revalidating, so
// a curator who edits and reloads is bounded by the CDN entry, not by their own
// browser holding a stale copy indefinitely. stale-while-revalidate lets the edge
// serve the old answer instantly while it fetches a new one behind the scenes, so
// the slow path is never on a visitor's critical path.
export function publicCache(maxAgeSec: number, swrSec = maxAgeSec * 10): HeadersInit {
  return {
    "Cache-Control": `public, s-maxage=${maxAgeSec}, stale-while-revalidate=${swrSec}`,
  };
}

// Editors need to see their own change immediately, and a CDN entry keyed on the
// URL cannot know an edit happened. Appending this makes the request a different
// cache key, so it goes straight to the function. Only for owner-initiated
// reloads — using it on every fetch would defeat the caching entirely.
export function cacheBust(): string {
  return `_=${Date.now()}`;
}
