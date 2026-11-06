# Security

## Reporting a vulnerability

Please report security issues privately to **themooseium@gmail.com** rather than
opening a public issue. Include enough detail to reproduce — a URL, a request, or
a short description of the flaw is plenty.

This is a personal project maintained by one person, so there is no formal SLA.
Expect an acknowledgement within a few days. Please give a reasonable window to
ship a fix before disclosing publicly.

## Scope

In scope: [mooseium.com](https://www.mooseium.com) and this repository.

Out of scope, because they are not ours to fix:

- The museum APIs and image CDNs this app reads from.
- Supabase, Vercel, and other hosted dependencies — report those upstream.
- Missing security headers on third-party image hosts reached through `/api/img`.

## What is already accounted for

So a report can skip ground that is covered:

- **Authorisation lives in the database.** Row-level security covers every table;
  ownership and public-visibility are DB policies, not application checks. Every
  `SECURITY DEFINER` function pins its `search_path`.
- **Secrets are server-only.** The service-role key never reaches the browser;
  museum API keys are used only in route handlers.
- **The image proxy validates hosts by parsing the URL** against an allowlist,
  not by substring matching, and passes through only image responses.
- **Rate limiting** is applied to mutation endpoints. Without `UPSTASH_REDIS_*`
  set it falls back to per-instance in-memory counting, which is bypassable
  across serverless instances — that is a known deployment requirement, not a
  code bug.

## Not a vulnerability

- Automated scanner output with no demonstrated impact.
- `npm audit` findings in build-time-only tooling.
- Anything requiring a user to paste code into their own console.
