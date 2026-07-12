# Mooseium

Curate your own art gallery from the collections of museums around the world, then
share a link so anyone can browse it. This repo is the v1 starter: a Next.js app
with a working per-museum search against The Metropolitan Museum of Art.

See the design docs (`virtual-gallery-spec.md`, `virtual-gallery-data-model.md`)
for the full plan. Short version: build the whole product in 2D first, add the
immersive 3D gallery later, and multi-user after that.

## What works right now

- A search page with a museum dropdown and a search box.
- Live per-museum search via a backend proxy (`/api/search`) across The Met, the
  Art Institute of Chicago, and the Cleveland Museum of Art — returning
  open-access works that have images, as a results grid.
- The museum-adapter foundation (`lib/museums`) that every future museum plugs into.
- Sign in with Google or an email magic link (Supabase auth).
- Create named collections and save any search result into a chosen collection.
- Browse your collections at `/collections` and each one at `/collections/[id]`.
- The full Supabase schema (`supabase/migrations/`), ready to run.

Sign-in and saving require connecting Supabase (see below). Search works without it.

Note: saved pieces currently display via the museums' own image URLs. The
save-time image-caching pipeline (copying images to our own CDN) is the next
backend step; the `artworks` table and save flow already have slots for it.

Not built yet (next steps): the image-caching worker, galleries, placards, and sharing.

## Run it locally

Requires Node 18.18+ (Node 20+ recommended).

```bash
npm install
npm run dev
```

Then open http://localhost:3000 and search (try "sunflowers"). No API key needed —
the Met, Art Institute, and Cleveland APIs are all key-free.

## Project structure

```
app/
  page.tsx              Search UI (dropdown + search box + results grid)
  layout.tsx            Root layout (+ header)
  globals.css           Styling
  components/
    Header.tsx          Auth-aware header (signed-in email / sign-in link)
  login/page.tsx        Sign in with Google or an email magic link
  auth/
    callback/route.ts   OAuth / magic-link code exchange
    signout/route.ts    Ends the session
  api/
    museums/route.ts    GET /api/museums  — museum list for the dropdown
    search/route.ts     GET /api/search   — per-museum search proxy
lib/
  museums/
    types.ts            The MuseumAdapter contract + shared types
    met.ts, artic.ts, cleveland.ts   The three museum adapters
    index.ts            Adapter registry — add new museums here
  supabase/
    client.ts           Browser Supabase client
    server.ts           Server Supabase client (cookies)
middleware.ts           Refreshes the auth session per request
supabase/
  migrations/
    0001_init.sql       Database schema + row-level security + museum seed
    0002_profiles_trigger.sql   Auto-create a profile row on signup
```

## Connecting Supabase (enables sign-in)

1. Create a project at https://supabase.com.
2. In the SQL editor, run the migrations in order:
   `0001_init.sql`, `0002_profiles_trigger.sql`, `0003_save_artwork.sql`,
   `0004_collections.sql`, `0006_popular_artworks.sql`, then
   `0007_more_museums.sql`. (`0005` is superseded — skip it.)
3. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     (Project Settings → API).
   - `SUPABASE_SERVICE_ROLE_KEY` (same page) — used later by the server-side
     save/image pipeline; not needed just for sign-in.
4. Restart `npm run dev`. The header will show a "Sign in" link.

### Email magic link

Works out of the box once Supabase is connected — no extra setup. Enter an
email on `/login` and open the link Supabase sends.

### Google sign-in

Google is an OAuth provider you enable in Supabase:

1. In Google Cloud Console, create an OAuth 2.0 Client ID (type: Web
   application). Add this authorized redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`.
2. In the Supabase dashboard → Authentication → Providers → Google, paste the
   Client ID and Client Secret and enable it.
3. In Authentication → URL Configuration, add `http://localhost:3000/**` (and
   later your production URL) to the allowed redirect URLs.

The app redirects through `/auth/callback`, which exchanges the code for a
session. A `profiles` row is created automatically on first sign-in by the
trigger in `0002_profiles_trigger.sql`.

Saving, galleries, and the image pipeline build on top of this.

## Key-based museums (Harvard, Smithsonian)

These appear in the search dropdown only when their key is set in `.env.local`.

- **Harvard Art Museums** — request a free key at
  https://harvardartmuseums.org/collections/api and set `HARVARD_API_KEY`.
  Rate limited to ~2,500 calls/day.
- **Smithsonian Open Access** — request a free api.data.gov key at
  https://api.data.gov/signup/ and set `SMITHSONIAN_API_KEY`.

Run `0007_more_museums.sql` (registers them so saves work) and restart the dev
server after adding keys.

## Rijksmuseum (no key needed)

Rijksmuseum uses its new keyless Search API (`data.rijksmuseum.nl/search/collection`)
plus EDM resolution for metadata and a directly usable IIIF image
(`iiif.micr.io/<id>/full/<w>,/0/default.jpg`). It's always available — no key —
but note it resolves each result individually (like the Met), so search is a bit
slower than the no-resolve museums. Free-text search maps to the `description`
field; era chips map full centuries to `creationDate` wildcards (e.g. `16??`).
It still needs its `museums` row, so run `0007_more_museums.sql`.

## Adding another museum

Write an adapter in `lib/museums/` that implements `MuseumAdapter` (see `met.ts`),
then register it in `lib/museums/index.ts`. Nothing else in the app changes — the
dropdown, search, and (later) save flow pick it up automatically.
