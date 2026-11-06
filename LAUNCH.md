# Mooseium — Launch Record

Mooseium is live at [mooseium.com](https://www.mooseium.com). This file was the
pre-launch checklist; it is now the record of what shipped and what is still
open. Forward-looking work lives in [POST-LAUNCH.md](POST-LAUNCH.md).

## Security posture

Last reviewed 2026-11-05. Dependency advisories are a moving target — treat any
blanket "no issues" claim here as stale and run `npm audit` yourself.

Strong by architecture:

- Supabase Auth — no homegrown auth
- RLS on every table; ownership and public-visibility enforced by DB policy
  rather than application checks. Every `SECURITY DEFINER` function pins its
  `search_path`
- No raw SQL interpolation (query builder + typed RPCs)
- No XSS — React escaping, no `dangerouslySetInnerHTML`, HTML stripped from
  museum text, anchors neutralised in the rich reader
- Secrets server-only; browser → our API → museum. `.env*` gitignored, and no
  `.env` has ever been committed

Shipped:

- [x] Rate limiting on all mutation endpoints (was only search/save/artwork/guestbook-sign)
- [x] Rate limiter memory sweep — no unbounded growth
- [x] Security headers — X-Frame-Options, X-Content-Type-Options,
      Referrer-Policy, Permissions-Policy, HSTS
- [x] CSP "safe subset" — `base-uri`, `object-src`, `frame-ancestors`,
      `form-action`. Deliberately does not restrict scripts/styles/images/fonts;
      see the note in `next.config.mjs`
- [x] Auth callback restricted to same-origin redirects — no open redirect
- [x] Image proxy validates hosts against an allowlist by parsing the URL, not
      by substring match, and passes through only image responses
- [x] Private vulnerability reporting path — [SECURITY.md](SECURITY.md)

## Launch checklist

### Infra

- [x] **Deploy** — Vercel production, production Google OAuth redirect URL,
      custom domain with automatic HTTPS
- [x] **Production env vars** set in Vercel
- [ ] **Confirm `UPSTASH_REDIS_REST_URL` / `_TOKEN` are set in Vercel.** The code
      path exists in `lib/rate-limit.ts`, but without those vars it silently
      falls back to per-instance in-memory counting, which is bypassable across
      serverless instances. The fallback is intentional for local dev; in
      production it is a hole. *Verify this one.*
- [ ] **Cloudflare** in front — free DDoS / WAF / bot protection
- [ ] **Custom SMTP** (Resend) in Supabase — the built-in email sender will not
      survive real signup volume. Blocked on buying the domain for a verified
      sender (see POST-LAUNCH Tier 3)
- [ ] **Backups** — Supabase Pro for daily snapshots + point-in-time recovery

### Legal / policy

- [x] Privacy policy — `/privacy`
- [x] Terms of use — `/terms`
- [x] Abuse/takedown path — `/api/report`, covering guestbook entries and
      curator notes

### Hardening

- [x] Error monitoring — Sentry, tunnelled through `tunnelRoute` so ad blockers
      don't swallow reports
- [ ] Strict nonce-based Content-Security-Policy. Needs per-request nonce wiring
      and real browser testing; a wrong one breaks the 3D museum's fonts and
      workers, and Supabase
- [ ] Input validation on API route bodies. Zod is **not** installed — this is
      unstarted, not partially done

### Product

- [x] Unique @handles — public curator profiles at `/[handle]`
- [x] Image-caching pipeline — `artwork-images` bucket (migration 0030),
      populated by `scripts/cache-artwork-images.mjs`. This exists because the
      Art Institute serves a laptop but refuses deployed infrastructure, so the
      script has to run from a normal connection and cannot be a cron job

## Ongoing habits

- Run `npm audit` periodically. A public repo turns this into Dependabot alerts
  anyone can read, so a standing critical on a direct dependency is visible
- Re-run a security review after adding auth, upload, or social features
- Keep secrets out of `NEXT_PUBLIC_*` and out of git
- Re-run `scripts/cache-artwork-images.mjs` after adding Art Institute pieces

## Migrations

Applied by hand in the Supabase SQL editor, in filename order: 0001 → 0030
(skip 0005, superseded). There is no migration CLI wired up, so
`supabase/migrations/` is the recipe rather than a record of what has run.
