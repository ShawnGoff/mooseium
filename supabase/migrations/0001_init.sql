-- Mooseium initial schema
-- Run this in your Supabase project's SQL editor (or via the Supabase CLI).
-- Mirrors virtual-gallery-data-model: shared catalog + thin per-user join.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- profiles: one row per auth user
create table if not exists profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text unique,
  display_name text,
  created_at   timestamptz not null default now()
);

-- museums: config/lookup for each source
create table if not exists museums (
  slug             text primary key,
  display_name     text not null,
  homepage_url     text,
  requires_api_key boolean not null default false,
  image_base_url   text,
  search_filters   jsonb not null default '{}',
  enabled          boolean not null default true,
  sort_order       integer not null default 0
);

-- artworks: shared canonical catalog (one row per museum object)
create table if not exists artworks (
  id                     uuid primary key default gen_random_uuid(),
  source_museum          text not null references museums (slug),
  museum_object_id       text not null,
  title                  text,
  artist                 text,
  date_text              text,
  medium                 text,
  culture                text,
  dimensions             text,
  object_type            text,
  description            text,
  credit_line            text,
  tags                   text[] not null default '{}',
  rights_status          text,
  license                text,
  attribution            text,
  source_image_url       text,
  image_thumb_url        text,
  image_medium_url       text,
  image_large_url        text,
  image_placeholder_url  text,
  aspect_ratio           double precision,
  source_url             text,
  processing_status      text not null default 'processing'
                           check (processing_status in ('processing','ready','failed')),
  raw_metadata           jsonb not null default '{}',
  image_checked_at       timestamptz,
  created_at             timestamptz not null default now(),
  unique (source_museum, museum_object_id)
);
create index if not exists artworks_tags_idx on artworks using gin (tags);
create index if not exists artworks_type_idx on artworks (object_type);

-- saved_artworks: thin personal-collection join
create table if not exists saved_artworks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  artwork_id  uuid not null references artworks (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, artwork_id)
);
create index if not exists saved_artworks_user_idx on saved_artworks (user_id);

-- galleries: a user's galleries
create table if not exists galleries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles (id) on delete cascade,
  name           text not null,
  description    text,
  room_template  text check (room_template in ('modern','classic','frick')),
  settings       jsonb not null default '{}',
  is_public      boolean not null default false,
  share_slug     text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists galleries_user_idx on galleries (user_id);

-- placed_artworks: 2D layout now, 3D transform reserved for v2
create table if not exists placed_artworks (
  id           uuid primary key default gen_random_uuid(),
  gallery_id   uuid not null references galleries (id) on delete cascade,
  artwork_id   uuid not null references artworks (id) on delete cascade,
  section      text,
  sort_order   integer not null default 0,
  wall         text,
  position_x   double precision,
  position_y   double precision,
  position_z   double precision,
  rotation_x   double precision,
  rotation_y   double precision,
  rotation_z   double precision,
  scale        double precision,
  frame_style  text,
  created_at   timestamptz not null default now()
);
create index if not exists placed_gallery_idx on placed_artworks (gallery_id);
create index if not exists placed_artwork_idx on placed_artworks (artwork_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table profiles        enable row level security;
alter table museums         enable row level security;
alter table artworks        enable row level security;
alter table saved_artworks  enable row level security;
alter table galleries       enable row level security;
alter table placed_artworks enable row level security;

-- profiles: readable by anyone, writable by owner
create policy "profiles are viewable by everyone"
  on profiles for select using (true);
create policy "users manage own profile"
  on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

-- museums: read-only reference data
create policy "museums are viewable by everyone"
  on museums for select using (true);

-- artworks: shared catalog, readable by everyone; writes go through the backend
-- service role (which bypasses RLS), so no insert/update policy for end users.
create policy "artworks are viewable by everyone"
  on artworks for select using (true);

-- saved_artworks: private to the owner
create policy "users manage own saved artworks"
  on saved_artworks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- galleries: owner full access; public galleries readable by anyone
create policy "users manage own galleries"
  on galleries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public galleries are viewable by everyone"
  on galleries for select using (is_public = true);

-- placed_artworks: owner (via gallery) full access; readable if the gallery is public
create policy "users manage placements in own galleries"
  on placed_artworks for all
  using (exists (
    select 1 from galleries g
    where g.id = placed_artworks.gallery_id and g.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from galleries g
    where g.id = placed_artworks.gallery_id and g.user_id = auth.uid()
  ));
create policy "placements in public galleries are viewable by everyone"
  on placed_artworks for select
  using (exists (
    select 1 from galleries g
    where g.id = placed_artworks.gallery_id and g.is_public = true
  ));

-- ---------------------------------------------------------------------------
-- Seed: the v1 museums
-- ---------------------------------------------------------------------------

insert into museums (slug, display_name, homepage_url, requires_api_key, sort_order)
values
  ('met',       'The Metropolitan Museum of Art', 'https://www.metmuseum.org', false, 1),
  ('artic',     'Art Institute of Chicago',       'https://www.artic.edu',     false, 2),
  ('cleveland', 'Cleveland Museum of Art',        'https://www.clevelandart.org', false, 3)
on conflict (slug) do nothing;
