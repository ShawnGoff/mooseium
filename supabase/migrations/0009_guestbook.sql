-- Guestbook: visitors can "sign" a public gallery with their name + a short note.
-- One signature per visitor per gallery (re-signing updates the message).

create table if not exists guestbook_entries (
  id           uuid primary key default gen_random_uuid(),
  gallery_id   uuid not null references galleries (id) on delete cascade,
  user_id      uuid not null references profiles (id) on delete cascade,
  display_name text,
  message      text,
  created_at   timestamptz not null default now(),
  unique (gallery_id, user_id)
);
create index if not exists guestbook_gallery_idx
  on guestbook_entries (gallery_id, created_at desc);

alter table guestbook_entries enable row level security;

-- Readable by anyone for public galleries; owners can read their own gallery's book.
create policy "guestbook readable for public galleries"
  on guestbook_entries for select using (
    exists (
      select 1 from galleries g
      where g.id = gallery_id and (g.is_public = true or g.user_id = auth.uid())
    )
  );

-- A signed-in visitor may sign a public gallery, as themselves.
create policy "sign public galleries"
  on guestbook_entries for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from galleries g where g.id = gallery_id and g.is_public = true
    )
  );

-- A visitor may edit their own signature.
create policy "update own signature"
  on guestbook_entries for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A visitor may remove their own signature; the gallery owner may remove any
-- signature in their gallery (light moderation).
create policy "remove own or owned signature"
  on guestbook_entries for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from galleries g where g.id = gallery_id and g.user_id = auth.uid()
    )
  );
