// TEMPORARY — delete after confirming Sentry works.
// GET /api/debug/sentry throws a server error so you can verify it shows up in
// the Sentry dashboard. onRequestError (in instrumentation.ts) reports it.

export const dynamic = "force-dynamic";

export function GET() {
  throw new Error("Sentry test error — server route (safe to ignore)");
}
