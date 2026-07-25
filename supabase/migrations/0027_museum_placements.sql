-- museum_placements — art (and, later, 3D objects) a curator places directly
-- onto their 3D museum, OUTSIDE the gallery collections: paintings on wing and
-- atrium walls, and (Phase 2) objects in the wing corner slots.
--
-- Paintings INSIDE galleries keep flowing from placed_artworks/collections as
-- before; this table is only for the free-standing museum placements the
-- in-museum editor creates.
--
-- slot_key is a STABLE anchor id minted by the app (Museum3D), e.g.
-- "wing:<wingId>:wall:2" or "atrium:N:0" — deliberately opaque text so the
-- anchor scheme can evolve without a schema change. One piece per anchor.

create table if not exists museum_placements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,

  slot_kind   text not null default 'wall' check (slot_kind in ('wall', 'object')),
  slot_key    text not null,

  source      text not null,          -- museum slug ('met', 'rijks', ...) for art
  external_id text not null,          -- the piece's id within that source
  title       text,
  image_url   text,                   -- display image (denormalized for the 3D)
  real_w      real,                   -- real-world size, for wall auto-sizing
  real_h      real,

  -- Phase 2 (objects); harmless for wall paintings.
  rotation_y  real not null default 0,
  mount       text not null default 'pedestal' check (mount in ('pedestal', 'floor')),

  created_at  timestamptz not null default now(),

  unique (user_id, slot_kind, slot_key)
);
create index if not exists museum_placements_user_idx on museum_placements (user_id);

-- Museums are public (anyone can walk /@handle/museum), so placements are
-- world-readable; only the owner can create/change/remove them.
alter table museum_placements enable row level security;

-- Idempotent: drop-then-create so re-running this migration never errors on an
-- already-existing policy (Postgres has no CREATE POLICY IF NOT EXISTS).
drop policy if exists "museum placements are viewable by everyone" on museum_placements;
create policy "museum placements are viewable by everyone"
  on museum_placements for select using (true);

drop policy if exists "users manage own museum placements" on museum_placements;
create policy "users manage own museum placements"
  on museum_placements for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
