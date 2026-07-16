# Mooseium — Post-Launch Tasks

Everything deferred or flagged during the Library build, organized by priority.
Nothing here blocks launch; it's the roadmap for after.

## Tier 1 — Soon after launch (quick wins & health)

- [ ] **V&A museum** — build the adapter against the v2 API (`api.vam.ac.uk`, NOT
  the deprecated 2009 API). Groundwork exists (seeded `vam` row, image host
  allow-listed, save-validation includes `vam`). Images are IIIF → reuse the
  existing image-proxy path. Add it **disabled**, test end-to-end, then flip
  `enabled` on. Zero risk to the live site.
- [ ] **Discovery resilience** — add Open Library search as a fallback so a
  Gutendex outage can't empty the Discover feed (reading is already independent
  of Gutendex; discovery isn't yet).
- [ ] **Error monitoring** — add Sentry (or similar) for real-user error
  visibility. Currently only Vercel Analytics/Speed Insights.
- [ ] **Music** — add the jazz tracks (drop `.mp3`s in `/public`, add entries in
  `MUSIC_TRACKS`) and fill in the artist credits in `app/credits/page.tsx`.
- [ ] **Perf** — lazy-load the "Popular" and connected-shelf rows after the
  Discover page paints, so nothing blocks first render.
- [ ] **Mobile pass** — test the Library end-to-end on a phone (2D tabs + the 3D
  room controls + reader).

## Tier 2 — Features

- [ ] **Public writing / "The Reading Room"** — let people share writings:
  `is_public` + `is_adult` + `share_slug` columns, a public read policy, a public
  reader page, an 18+ blur/consent gate, and a Report button (reuse the existing
  gallery report flow). This is real UGC + moderation — build it deliberately.
- [ ] **Standard Ebooks** — a second *readable* source (beautifully formatted
  public-domain texts) to reduce reliance on Gutenberg.
- [ ] **Open Library for discovery** — richer covers/metadata and more titles in
  search results (feeding people toward readable editions).
- [ ] **Book-view reader** — an optional paginated "turn the page" mode alongside
  the current scroll reader.
- [ ] **In-book navigation** — safely restore table-of-contents / footnote links
  in the rich reader (currently all anchors are neutralized for safety).
- [ ] **Better "Continue reading"** — add a `last_read_at` timestamp so the shelf
  orders by when you last read, not when the book was added.
- [ ] **Self-serve music** — move the track list to an editable `tracks.json`.

## Tier 3 — Ecosystem & infrastructure

- [ ] **Domain & email** — buy `moosehouse.com`, set up subdomains (e.g.
  `museum.` and `library.`), and switch magic-link email from Gmail SMTP to
  Resend (needs the domain for a verified sender).
- [ ] **Media room** — record-player music station + RSS podcasts (the deferred
  "third room").
- [ ] **3D polish** — swap procedural furniture for real low-poly models
  (Kenney / Quaternius `.glb`); optional dome skylight.
- [ ] **Scaling the museum** — support more than 3 wings / 9 rooms; multiple
  museums per curator.

## Tier 4 — Polish & hardening (from the Fable review + a11y)

- [ ] Replace `window.prompt` / `confirm` (folder create/rename/delete) with
  in-app modals.
- [ ] Focus traps on modals; a full keyboard / accessibility pass.
- [ ] Reader keyboard handler: don't intercept Space/arrows when a button or
  control is focused.
- [ ] Highlight-save: use an append RPC to avoid a read-modify-write race across
  tabs.
- [ ] Query error states: show a retry message instead of a misleading empty
  state when a DB/API call fails.

---

*Reminder: the whole book layer leans on Gutendex. Spreading it across Open
Library + Standard Ebooks (Tier 1/2) is the durable fix so no single flaky API
can take down discovery.*
