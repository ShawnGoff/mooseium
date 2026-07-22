// Sentry — browser. Only initialises when a DSN is configured, so local dev and
// any deploy without the env var behave exactly as before.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
    // Sample a slice of traces rather than everything — keeps volume (and the
    // free tier) sane while still surfacing patterns.
    tracesSampleRate: 0.1,
    // Don't send user PII (emails, IPs) to a third party.
    sendDefaultPii: false,
    // Session Replay records real user sessions — off until we decide we want it.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Noise we can't act on: browser extensions, aborted navigations, and the
    // museum CDN image failures we already handle with fallbacks.
    ignoreErrors: [
      "ResizeObserver loop",
      "AbortError",
      "Non-Error promise rejection captured",
    ],
  });
}
