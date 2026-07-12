-- The default "wing" that holds a curator's unfiled collections sits at the
-- centre of the 3D museum. Let curators rename it (default shown: "Main Gallery").

alter table profiles add column if not exists center_wing_name text;

alter table profiles drop constraint if exists profiles_center_wing_len;
alter table profiles
  add constraint profiles_center_wing_len
  check (center_wing_name is null or char_length(center_wing_name) <= 60);
