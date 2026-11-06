// Sentry — browser. Only initialises when a DSN is configured, so local dev and
// any deploy without the env var behave exactly as before.
//
// Was sentry.client.config.ts. Renamed because that filename is deprecated and
// stops working under Turbopack; instrumentation-client.ts is the convention
// Next picks up from 15.3 on. Same contents, same behaviour.

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
      // A blocked third-party script rejects with a DOM Event rather than an
      // Error, and Sentry words that case differently from the line above, so it
      // slipped through. Ad blockers and Edge's tracking prevention (on by
      // default) block the Vercel analytics scripts for a large share of real
      // visitors, so this fires on ordinary pageviews — not just the bot traffic
      // that made us notice it. Nothing here is actionable: the app has no
      // promise that rejects with an Event.
      "captured as promise rejection",
      "Object captured as promise rejection",
      // Deliberately NOT filtering "Failed to fetch" and friends here, tempting
      // though it is: that is the generic message for ANY network failure,
      // including our own API calls, so suppressing it would hide real breakage
      // to silence some ad-blocker noise. denyUrls below is the targeted way to
      // drop the third-party version without losing ours.
    ],
    // Belt and braces: drop anything whose stack sits in third-party analytics
    // rather than our own bundle. ignoreErrors matches on message, which shifts
    // between browsers and SDK versions; this matches on origin, which does not.
    denyUrls: [/\/_vercel\/(insights|speed-insights)\//, /vitals\.vercel-insights\.com/],
  });
}

// Ties client-side route changes into Sentry's tracing, so a slow or failing
// navigation is attributed to the route it came from rather than appearing as a
// bare pageload. Next looks for this export by name in this file.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
