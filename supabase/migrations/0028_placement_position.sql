-- Free positioning for wall placements (drag-to-move in the in-museum editor).
-- A placement normally renders at its slot anchor; once the curator drags it,
-- we store an explicit world position here and render there instead. The slot
-- anchor is still used for the wall's ROTATION (paintings stay wall-flat) and as
-- the fallback when no custom position is set.

alter table museum_placements
  add column if not exists pos_x real,
  add column if not exists pos_y real,
  add column if not exists pos_z real;
