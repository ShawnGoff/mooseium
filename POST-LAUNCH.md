# Mooseium — Roadmap

Deferred and flagged work, roughly by priority. Launch history and the
security record live in [LAUNCH.md](LAUNCH.md).

## Shipped since launch

Kept here because the old list claimed these were pending:

- **V&A museum** — adapter built against the v2 API (`lib/museums/vam.ts`),
  seventh museum, live
- **Error monitoring** — Sentry, tunnelled past ad blockers
- **Music** — nine tracks in `/public`, wired into `MUSIC_TRACKS`, all credited
  in `app/credits/page.tsx`
- **Image caching** — `artwork-images` bucket, so the Art Institute's refusal to
  serve datacenter IPs stops blanking its galleries
- **In-museum editor** — hang art on wing and atrium walls, drag along the wall,
  assign collections to wings, all from inside the museum
- **Real artwork dimensions** — art hangs at its stated size, so a large canvas
  takes a wall to itself

## Tier 1 — Health and quick wins

- [ ] **Per-wall relative scaling.** Real dimensions are in, but a wall of small
  works now leaves a lot of empty wall. Scale a wall's pieces relative to each
  other so they fill the space, while keeping the relative sizes honest — a
  Night Watch next to a miniature should still read as enormous.
- [ ] **Nameplate overflow.** Long titles still overrun the placard. A
  measure-then-fit pass was tried and reverted: calling `setFit` from troika's
  `onSync` re-enters the R3F render tree and crashes the museum. Any fix has to
  measure outside the render loop, or truncate without measuring.
- [ ] **Discovery resilience** — add Open Library as a *search* fallback so a
  Gutendex outage can't empty the Discover feed. Open Library is already used for
  book detail (`app/api/den/books/detail/route.ts`), but not for discovery, and
  reading is already independent of Gutendex.
- [ ] **Perf** — lazy-load the "Popular" and connected-shelf rows after the
  Discover page paints, so nothing blocks first render.
- [ ] **Mobile pass** — test the Den end-to-end on a phone: 2D tabs, the 3D room
  controls, and the reader.
- [ ] **Input validation** — Zod on API route bodies. Not installed yet.

## Tier 2 — Features

- [ ] **Public writing / "The Reading Room"** — let people share writings:
  `is_public` + `is_adult` + `share_slug` columns, a public read policy, a public
  reader page, an 18+ blur/consent gate, and a Report button (reuse the existing
  gallery report flow). Real UGC plus moderation — build it deliberately.
- [ ] **Standard Ebooks** — a second *readable* source of well-formatted
  public-domain texts, to reduce reliance on Gutenberg.
- [ ] **Open Library for discovery** — richer covers and metadata, more titles in
  search results, feeding people toward readable editions.
- [ ] **Book-view reader** — an optional paginated "turn the page" mode alongside
  the current scroll reader.
- [ ] **In-book navigation** — safely restore table-of-contents and footnote
  links in the rich reader. All anchors are currently neutralised for safety, so
  this needs an allowlist of same-document targets, not a blanket re-enable.
- [ ] **Better "Continue reading"** — add a `last_read_at` timestamp so the shelf
  orders by when you last read, not when the book was added.
- [ ] **Self-serve music** — move the track list to an editable `tracks.json`.

## Tier 3 — Ecosystem and infrastructure

- [ ] **Domain and email** — buy the domain, set up subdomains (`museum.`,
  `library.`), and move magic-link email from Gmail SMTP to Resend. Resend needs
  the domain for a verified sender, which is what blocks the custom-SMTP item in
  LAUNCH.md.
- [ ] **Cloudflare** in front for DDoS and WAF (also in LAUNCH.md).
- [ ] **Backups** — Supabase Pro for daily snapshots and point-in-time recovery
  (also in LAUNCH.md).
- [ ] **Media room** — record-player music station plus RSS podcasts, the
  deferred "third room".
- [ ] **3D polish** — swap procedural furniture for real low-poly models
  (Kenney / Quaternius `.glb`); optional dome skylight.
- [ ] **Scaling the museum** — source museums are still a fixed 3 wings × 3
  galleries (`app/api/source-museum/route.ts`). Support more wings and rooms, and
  multiple museums per curator.
- [ ] **LLM-curated themes** — the source-museum wings are hardcoded searches.
  The daily discovery shelves already run through an LLM; themes could too.

## Tier 4 — Polish and accessibility

- [ ] Replace the remaining `window.prompt` / `window.confirm` calls (folder
  create, rename, delete — 7 call sites) with in-app modals.
- [ ] Focus traps on modals; a full keyboard and accessibility pass.
- [ ] Reader keyboard handler: don't intercept Space or arrows when a button or
  control is focused.
- [ ] Highlight-save: use an append RPC to avoid a read-modify-write race across
  tabs.
- [ ] Query error states: show a retry message instead of a misleading empty
  state when a DB or API call fails.
- [ ] Strict nonce-based CSP (also in LAUNCH.md).

## Standing risks

**The book layer leans on Gutendex.** Spreading it across Open Library and
Standard Ebooks (Tier 1/2) is the durable fix, so no single flaky API can take
down discovery.

**Museum APIs change without warning.** The Met retired `/v1/search` on
2026-10-01 and it went unnoticed for three weeks, which silently broke Met
search everywhere it appears — the museum's own search, its source-museum rooms,
the homepage theme cards, and the Met share of the daily shelves. `npm run smoke`
hits every important page and API; running it on a schedule would have caught
this on day one.
