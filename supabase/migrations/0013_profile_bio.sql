-- Optional short bio shown on a curator's public profile page.

alter table profiles add column if not exists bio text;
