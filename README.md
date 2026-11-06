# Mooseium

Curate your own art gallery from the open-access collections of seven museums —
then walk through it in 3D and share the link.

**Live at [mooseium.com](https://www.mooseium.com)**

Search the Met, the Art Institute of Chicago, Cleveland, the Rijksmuseum,
Harvard, the Smithsonian and the V&A; save pieces into named collections;
publish a collection and it becomes a room in a first-person 3D museum that
anyone can wander.

## What it does

**Search and collect.** One search box across seven museums, each behind an
adapter that normalises its API into a common shape. Only open-access works with
usable images. Save anything into a collection.

**A 3D museum.** Published collections become rooms, grouped into wings off a
central atrium. Walk it with WASD, drag to look, click a painting for its full
placard, click again to see it full screen. Art hangs at its real size where the
museum states dimensions, so a large canvas takes a wall to itself.

**An in-museum editor.** Owners can hang art directly on wing and atrium walls,
drag it along the wall, and assign collections to wings — from inside the museum.

**The Den.** A private library alongside the galleries: search and read
public-domain books from Project Gutenberg, keep notes, and organise both into
folders.

**Source museums.** Each museum also has a prebuilt 3D showcase, themed into
wings and galleries, so there is something to walk through before you have
curated anything.

## Running it locally

Requires Node 22 (see `.nvmrc`).

```bash
npm install
npm run dev
```

Search works immediately with no configuration — the Met, Art Institute,
Cleveland and Rijksmuseum APIs are all key-free. Sign-in, saving and the 3D
museum need Supabase.

### Connecting Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run every file in `supabase/migrations/` **in filename
   order**. There is no migration CLI wired up — they are applied by hand, so the
   folder is the recipe rather than a record of what has run.
3. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from Project
   Settings → API.
4. Restart the dev server.

Email magic links work immediately. For Google sign-in, enable it under
Authentication → Providers with an OAuth client whose redirect URI is
`https://<project-ref>.supabase.co/auth/v1/callback`, and add
`http://localhost:3000/**` to the allowed redirect URLs.

### Optional keys

Everything below is optional; each feature stays switched off without its key.

| Variable | Enables |
| --- | --- |
| `HARVARD_API_KEY` | Harvard Art Museums ([free key](https://harvardartmuseums.org/collections/api)) |
| `SMITHSONIAN_API_KEY` | Smithsonian ([free key](https://api.data.gov/signup/)) |
| `LLM_API_KEY` + `CRON_SECRET` | Daily AI-curated discovery shelves |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` | Rate limiting shared across instances |
| `NEXT_PUBLIC_SENTRY_DSN` | Error reporting |

Without Upstash the rate limiter falls back to per-instance in-memory counting,
which is fine locally but bypassable across serverless instances in production.

## How it fits together

```
app/
  api/            Route handlers — search, save, collections, museum, placements
  lab/museum/     The 3D museum: layout, rendering, the in-museum editor
  lab/gallery3d.tsx  Shared 3D primitives (player, framed artwork, textures)
  den/            The library
  [handle]/       Public curator profiles and their 3D museum
lib/
  museums/        One adapter per museum behind a shared MuseumAdapter contract
  supabase/       Browser, server and service-role clients
supabase/migrations/   Schema, row-level security, and seed data
scripts/          Maintenance run from a developer machine, not from the server
```

A few decisions worth knowing before reading the code:

**Everything is enforced in the database.** Row-level security covers every
table; ownership and public-visibility are DB policies rather than application
checks. Every `SECURITY DEFINER` function pins its `search_path`.

**Museum images go through `/api/img`.** Several museum CDNs send no CORS
headers, which taints a WebGL texture, and some refuse datacenter IPs outright.
The proxy validates the host against an allowlist by parsing the URL — not by
matching the string — and passes through only image responses.

**Some museums will not serve a server.** The Art Institute answers requests
from a laptop but refuses them from deployed infrastructure, so those images are
copied into our own storage bucket by `scripts/cache-artwork-images.mjs`, which
has to run from a normal connection. This is why that script exists and why it
is not a cron job.

**Adding a museum** means writing an adapter in `lib/museums/` against the
`MuseumAdapter` contract (`met.ts` is the clearest example) and registering it in
`index.ts`. Search, filters, saving and the 3D museum pick it up with no other
changes.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run smoke` | Hit every important page and API, report what is broken |

## Credits

All artwork comes from the participating museums' open-access programmes and
remains theirs. Mooseium is not affiliated with or endorsed by any of them.
Books come from [Project Gutenberg](https://www.gutenberg.org) via
[Gutendex](https://gutendex.com).

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE) — free to use, modify and share for any
purpose other than a commercial one.
