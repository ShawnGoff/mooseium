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
  // OFF because of the 3D museum. StrictMode double-mounts every component in
  // DEV: react-three-fiber builds a WebGLRenderer on the first mount, StrictMode
  // tears it down, and disposing a renderer calls forceContextLoss() on its
  // canvas — which react-three-fiber then reuses for the second mount, now with a
  // context that cannot be recovered. The museum comes up blank with
  // "THREE.WebGLRenderer: Context Lost" and textures/geometries/drawCalls all at
  // zero, i.e. dead before anything was ever uploaded.
  //
  // It never affected production (StrictMode's double-invoke is development-only),
  // which is exactly why the live site was fine while localhost was unusable.
  reactStrictMode: false,
  // Don't advertise the framework (Seobility/security nicety).
  poweredByHeader: false,
  images: {
    // CURRENTLY INERT — nothing in the app imports next/image, so the Image
    // Optimization API this allowlist guards is never invoked. Museum thumbnails
    // go through plain <img> and our own /api/img proxy (lib/museum-image.ts
    // holds the allowlist that actually enforces anything), and the OG routes
    // render via next/og's satori pipeline. Kept because it costs nothing and is
    // the right list the day we do adopt next/image — but don't read it as an
    // active control, and note it has drifted: /api/img allows eight museum
    // domains, this allows three.
    //
    // Side effect worth knowing: no next/image also means sharp is unreachable
    // here, which is why we left its libvips advisory unpatched rather than take
    // a breaking next 16 upgrade for it.
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
  // Proxy browser error reports through our OWN origin instead of sending them
  // straight to ingest.sentry.io. Ad blockers and Edge's tracking prevention
  // (on by default) block that hostname outright — every client-side report was
  // dying as ERR_BLOCKED_BY_CLIENT, so browser errors never reached the
  // dashboard for a large share of real visitors. A same-origin request isn't
  // blocked. Costs one serverless invocation per event.
  tunnelRoute: "/monitoring",
  webpack: { treeshake: { removeDebugLogging: true } },
});
