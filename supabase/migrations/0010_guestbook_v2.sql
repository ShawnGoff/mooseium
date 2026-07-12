-- Guestbook v2: owner replies, per-gallery on/off, and per-owner user blocks.

-- Owner reply to a signature.
alter table guestbook_entries add column if not exists owner_reply text;
alter table guestbook_entries add column if not exists owner_reply_at timestamptz;

-- Per-gallery toggle.
alter table galleries add column if not exists guestbook_enabled boolean not null default true;

-- Per-owner block list: an owner blocks a user from signing any of their galleries.
create table if not exists user_blocks (
  owner_id        uuid not null references profiles (id) on delete cascade,
  blocked_user_id uuid not null references profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (owner_id, blocked_user_id)
);
alter table user_blocks enable row level security;
create policy "manage own blocks"
  on user_blocks for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Rebuild the guestbook SELECT policy to hide entries from blocked users.
drop policy if exists "guestbook readable for public galleries" on guestbook_entries;
create policy "guestbook readable"
  on guestbook_entries for select using (
    exists (
      select 1 from galleries g
      where g.id = gallery_id and (g.is_public = true or g.user_id = auth.uid())
    )
    and not exists (
      select 1 from galleries g2
      join user_blocks b on b.owner_id = g2.user_id
      where g2.id = gallery_id and b.blocked_user_id = guestbook_entries.user_id
    )
  );

-- Rebuild the sign (INSERT) policy: gallery must be public AND guestbook enabled,
-- and the signer must not be blocked by that gallery's owner.
drop policy if exists "sign public galleries" on guestbook_entries;
create policy "sign public galleries"
  on guestbook_entries for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from galleries g
      where g.id = gallery_id and g.is_public = true and g.guestbook_enabled = true
    )
    and not exists (
      select 1 from galleries g2
      join user_blocks b on b.owner_id = g2.user_id
      where g2.id = gallery_id and b.blocked_user_id = auth.uid()
    )
  );

-- Let the gallery owner update entries in their gallery (used to add a reply).
create policy "owner may reply"
  on guestbook_entries for update
  using (
    exists (select 1 from galleries g where g.id = gallery_id and g.user_id = auth.uid())
  )
  with check (
    exists (select 1 from galleries g where g.id = gallery_id and g.user_id = auth.uid())
  );
