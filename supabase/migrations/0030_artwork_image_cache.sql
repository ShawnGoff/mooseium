-- Cache artwork images in our own storage bucket.
--
-- Some museum CDNs refuse Vercel's datacenter IPs outright: /api/img gets a fast
-- 502 for every Art Institute and Harvard image in production while the very same
-- URLs return 200 from a home connection. Harvard still rescues itself through
-- ProxyArtwork's direct-from-museum fallback (it sends CORS headers); the Art
-- Institute blocks that path too, so those pieces have no route at all and fall
-- back to a title card.
--
-- Retrying upstream cannot fix that — the refusal is about who is asking, not what
-- is asked for (every IIIF derivative size fails identically). So we stop asking at
-- render time: once an image is copied into our bucket it is served from Supabase's
-- CDN, which is CORS-clean, immune to the museums' IP rules, and survives the
-- museums renaming or expiring their URLs.
--
-- NOTE ON POPULATING IT: the copy has to run from somewhere the museums will serve.
-- Vercel is exactly the blocked party, so scripts/cache-artwork-images.mjs is meant
-- to be run from a normal connection (see its header).

alter table artworks add column if not exists image_cached_url text;
-- When we last tried to cache, so a retry pass can skip fresh failures.
alter table artworks add column if not exists image_cached_at timestamptz;

create index if not exists artworks_uncached_idx
  on artworks (id)
  where image_cached_url is null;

-- Public bucket: these are open-access images already published by the museums,
-- and the 3D canvas needs to read them without credentials.
insert into storage.buckets (id, name, public)
values ('artwork-images', 'artwork-images', true)
on conflict (id) do update set public = true;

-- Anyone may read a cached image; only the service role writes them (the backfill
-- script), so no insert/update/delete policy is granted to normal users.
drop policy if exists "cached artwork images are public" on storage.objects;
create policy "cached artwork images are public"
  on storage.objects for select
  using (bucket_id = 'artwork-images');
