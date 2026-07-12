-- Abuse reports for public content (galleries + guestbook entries).
-- Signed-in users can submit reports; only the service role can read them
-- (no select policy = RLS denies reads to regular users).

create table if not exists reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references profiles (id) on delete set null,
  target_type     text not null check (target_type in ('gallery', 'guestbook')),
  gallery_id      uuid references galleries (id) on delete cascade,
  subject_user_id uuid references profiles (id) on delete set null,
  reason          text not null,
  details         text,
  resolved        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists reports_unresolved_idx
  on reports (created_at) where resolved = false;

alter table reports enable row level security;

-- Anyone signed in may file a report under their own id.
create policy "submit reports"
  on reports for insert
  with check (auth.uid() = reporter_id);
