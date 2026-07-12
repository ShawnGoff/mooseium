-- Wings: a user groups their collections (galleries) into named "wings" of the
-- museum. Museum → Wings → Collections → Artworks.
-- A wing is just a name stored on each gallery; collections that share a wing
-- name belong to the same wing. NULL/empty = unassigned (falls into a default
-- wing in the 3D museum). Keeping it a plain text column keeps the assignment UI
-- dead simple (a dropdown of existing wing names + "new wing").

alter table galleries add column if not exists wing text;

alter table galleries drop constraint if exists gallery_wing_len;
alter table galleries
  add constraint gallery_wing_len
  check (wing is null or char_length(wing) <= 60);
