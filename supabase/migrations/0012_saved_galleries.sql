-- Bookmark other people's public galleries.

create table if not exists saved_galleries (
  user_id    uuid not null references profiles (id) on delete cascade,
  gallery_id uuid not null references galleries (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, gallery_id)
);
alter table saved_galleries enable row level security;

create policy "read own saved galleries"
  on saved_galleries for select using (auth.uid() = user_id);

create policy "save public galleries"
  on saved_galleries for insert with check (
    auth.uid() = user_id
    and exists (select 1 from galleries g where g.id = gallery_id and g.is_public = true)
  );

create policy "remove own saved galleries"
  on saved_galleries for delete using (auth.uid() = user_id);
