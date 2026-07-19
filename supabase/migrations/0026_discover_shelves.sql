-- Cached "discovery shelves" for the Library and Museum discover feeds.
-- Rows are written by the (server-side) generation job using the service role;
-- clients only read. A row's `shelves` is a JSON array of { title, blurb, query }.
--
-- surface : which discover feed — 'library' (books) or 'museum' (art).
-- user_id : NULL = global shelves everyone sees; a value = a personalized set
--           for that user (Phase 2, "curation intelligence"). Same table, so
--           personalized feeds slot in with no schema change.

create table if not exists public.discover_shelves (
  id uuid primary key default gen_random_uuid(),
  surface text not null check (surface in ('library', 'museum')),
  user_id uuid references auth.users (id) on delete cascade,
  shelves jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- At most one current row per global surface, and one per (surface, user).
create unique index if not exists discover_shelves_global
  on public.discover_shelves (surface)
  where user_id is null;
create unique index if not exists discover_shelves_user
  on public.discover_shelves (surface, user_id)
  where user_id is not null;

alter table public.discover_shelves enable row level security;

-- Anyone may read global shelves; a signed-in user may also read their own.
-- No insert/update/delete policies exist, so all writes are denied to anon and
-- authenticated clients — only the service role (which bypasses RLS in the
-- generation job) can write.
drop policy if exists "read discover shelves" on public.discover_shelves;
create policy "read discover shelves" on public.discover_shelves
  for select
  using (user_id is null or user_id = auth.uid());
