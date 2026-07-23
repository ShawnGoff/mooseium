import { withSentryConfig } from "@sentry/nextjs";

// Security response headers. These are safe defaults that don't break the app.
// The Content-Security-Policy here is the "safe subset": it hardens against
// clickjacking, <base>-tag injection, plugins, and form hijacking WITHOUT
// restricting scripts/styles/images/fonts (a full nonce-based script-src is a
// follow-up — it needs per-request nonce wiring + browser testing, and a wrong
// one would break the 3D museum's fonts/workers and Supabase).
const CSP = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: CSP },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework (Seobility/security nicety).
  poweredByHeader: false,
  images: {
    // Museum image CDNs we load thumbnails from directly (before we cache our own).
    remotePatterns: [
      { protocol: "https", hostname: "images.metmuseum.org" },
      { protocol: "https", hostname: "www.artic.edu" },
      { protocol: "https", hostname: "openaccess-cdn.clevelandart.org" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Sentry wraps the config to instrument the build and (optionally) upload source
// maps so stack traces are readable. Everything here degrades safely: with no
// SENTRY_AUTH_TOKEN it simply skips the upload, and with no DSN the SDK never
// initialises at all.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
});
