-- A curator's personal note on a piece within one of their galleries.
-- Lives on the placement, so the same artwork can carry a different note in
-- different galleries.

alter table placed_artworks add column if not exists note text;
