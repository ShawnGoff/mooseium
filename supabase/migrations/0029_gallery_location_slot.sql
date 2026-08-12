-- Give each per-location 2D collection ("Main Room", "North Gallery", ...) a
-- stable slot id, so the in-museum editor can find it without going through its
-- name or its in_museum flag.
--
-- Those collections are user-facing: curators see them in /collections and can
-- rename one or tick "Show this collection in your 3D museum" like any other.
-- Resolving them by (name, in_museum = false) broke the moment a curator did
-- either — the next wall placement minted a DUPLICATE collection, and removing a
-- placement could no longer find the collection to pull the piece back out of,
-- leaving art in the 2D collection that is no longer hanging in the museum.
--
-- With location_slot carrying the mapping, in_museum goes back to meaning only
-- "should this collection appear as a 3D room", which is what 0023 introduced it
-- for, and renaming a location collection becomes a plain cosmetic edit.
--
-- Slot ids mirror Museum3D's wall-anchor keys, one per LOCATION rather than per
-- wall: 'atrium' (every atrium wall shares Main Room) and 'wing:N' / 'wing:W' /
-- 'wing:E', keyed by the wing's atrium side — the same stable id the anchors use,
-- so it survives wings being renamed or re-ordered.

alter table galleries add column if not exists location_slot text;

-- Adopt the collections the name-keyed code already created. Scoped to the exact
-- shape it produced (hidden from the museum, never shared) so a curator's own
-- hidden collection that happens to be called "Main Room" is left alone.
--
-- distinct on picks the earliest collection per (curator, name): if a curator
-- already tripped the duplicate bug, the original is adopted and the stray copy
-- stays an ordinary collection they can delete, rather than failing the unique
-- index below.
with target as (
  select distinct on (g.user_id, g.name) g.id, g.name
  from galleries g
  where g.location_slot is null
    and g.in_museum = false
    and g.share_slug is null
    and g.name in ('Main Room', 'North Gallery', 'West Gallery', 'East Gallery')
  order by g.user_id, g.name, g.created_at
)
update galleries g
set location_slot = case t.name
    when 'Main Room'     then 'atrium'
    when 'North Gallery' then 'wing:N'
    when 'West Gallery'  then 'wing:W'
    when 'East Gallery'  then 'wing:E'
  end
from target t
where g.id = t.id;

-- One location collection per slot per curator. Partial, so ordinary
-- collections (location_slot null) are unconstrained.
create unique index if not exists galleries_user_location_slot_idx
  on galleries (user_id, location_slot)
  where location_slot is not null;
