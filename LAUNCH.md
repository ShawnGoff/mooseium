# Mooseium — Launch Readiness

Living checklist for going public. Check items off as you go.

## Security posture (audited)

No critical/high issues found. Strong by architecture:
- Supabase Auth (no homegrown auth)
- RLS on every table; ownership + public-visibility enforced in the DB
- No raw SQL interpolation (query builder + typed RPCs)
- No XSS (React escaping; no `dangerouslySetInnerHTML`; HTML stripped from museum text)
- Secrets server-only; browser → our API → museum. `.env.local` gitignored

### Fixed
- [x] Rate-limit all mutation endpoints (was only search/save/artwork/guestbook-sign)
- [x] Rate limiter memory sweep (no unbounded growth)
- [x] Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS)
- [x] Auth callback: same-origin redirects only (no open redirect)
- [x] `npm audit` → 0 vulnerabilities (pinned patched postcss)

## Launch checklist

### Infra / must-do before public
- [ ] **Distributed rate limiting** (Upstash Redis) — in-memory limiter doesn't work across serverless instances. *Top priority.*
- [ ] **Cloudflare** in front — free DDoS / WAF / bot protection
- [ ] **Custom SMTP** (Resend) in Supabase — built-in email won't survive real signups
- [ ] **Backups** — Supabase Pro for daily + point-in-time recovery
- [ ] **Deploy** — Vercel prod, production Google OAuth redirect URL, custom domain (HTTPS auto)
- [ ] **Set prod env vars** in Vercel (Supabase URL/anon/service-role, museum keys) — never commit

### Legal / policy (required for public UGC)
- [ ] Privacy policy
- [ ] Terms of use
- [ ] Abuse/takedown path (guestbook + curator notes are user content)

### Hardening (before or shortly after launch)
- [ ] Strict nonce-based Content-Security-Policy (needs browser testing)
- [ ] Zod input validation on API route bodies
- [ ] Structured logging + error monitoring (e.g. Sentry)

### Product
- [ ] Unique @handles (identity / anti-impersonation) — reuses unused `profiles.username`
- [ ] Image-caching pipeline (own CDN; needed for reliability + 3D)

## Ongoing habits
- Run `npm audit` periodically
- Re-run a security review after adding auth/upload/social features
- Keep secrets out of `NEXT_PUBLIC_*` and out of git

## Migrations to run (Supabase SQL editor, in order)
0001 → 0011 (skip 0005 — superseded). Latest: 0009/0010 guestbook, 0011 display names.
