-- The Den (Mooseprint) — a private study attached to the museum.
-- Everything here is owner-private, unlike the public galleries upstairs.
-- Three additive tables, one shared folder tree holding both saved books and
-- the user's own writing. Nothing existing is modified.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- den_folders: a per-user tree. parent_folder_id null = top level.
create table if not exists den_folders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles (id) on delete cascade,
  parent_folder_id uuid references den_folders (id) on delete cascade,
  name             text not null,
  sort             integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists den_folders_user_idx on den_folders (user_id);
create index if not exists den_folders_parent_idx on den_folders (parent_folder_id);

-- den_books: a saved reference to a public-domain book from a book API.
-- Deleting a folder keeps the book (folder_id -> null), so nothing is lost.
create table if not exists den_books (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  folder_id    uuid references den_folders (id) on delete set null,
  source       text not null,           -- 'gutenberg' | 'openlibrary' | 'standardebooks' | ...
  external_id  text not null,           -- the book's id within that source
  title        text,
  author       text,
  cover_url    text,
  progress     jsonb not null default '{}',  -- { location, percent }
  created_at   timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index if not exists den_books_user_idx on den_books (user_id);
create index if not exists den_books_folder_idx on den_books (folder_id);

-- den_documents: the user's own writing (journals, stories, drafts).
create table if not exists den_documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  folder_id   uuid references den_folders (id) on delete set null,
  title       text not null default 'Untitled',
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists den_documents_user_idx on den_documents (user_id);
create index if not exists den_documents_folder_idx on den_documents (folder_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security: owner-only on all three.
-- ---------------------------------------------------------------------------

alter table den_folders   enable row level security;
alter table den_books     enable row level security;
alter table den_documents enable row level security;

create policy "users manage own den folders"
  on den_folders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own den books"
  on den_books for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users manage own den documents"
  on den_documents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
