-- Optional custom name for a curator's 3D museum. Falls back in the app to
-- "<display name>'s Museum" when empty.

alter table profiles add column if not exists museum_name text;
alter table profiles drop constraint if exists museum_name_len;
alter table profiles add constraint museum_name_len
  check (museum_name is null or char_length(museum_name) <= 60);
