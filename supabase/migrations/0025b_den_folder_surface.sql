-- Give folders a "surface" so reading and writing each have their own tree.
-- Before this, den_folders was a single shared tree shown under both the Books
-- and Writing tabs, which was confusing (a "Notes" writing folder appeared while
-- browsing books, and vice-versa). Now each folder belongs to one surface:
--   'books'   -> shows only on the Books tab
--   'writing' -> shows only on the Writing tab
-- Subfolders inherit their parent's surface (enforced in the app at create time).

alter table den_folders
  add column if not exists surface text not null default 'books'
    check (surface in ('books', 'writing'));

-- Backfill existing folders by MAJORITY CONTENT: if a folder holds more of the
-- user's own documents than saved books, it's a writing folder; otherwise books.
-- Empty folders keep the default 'books'. Run once; new folders set surface at
-- creation time.
update den_folders f
set surface = 'writing'
where (
        select count(*) from den_documents d where d.folder_id = f.id
      ) > (
        select count(*) from den_books b where b.folder_id = f.id
      );
