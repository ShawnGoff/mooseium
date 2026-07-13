-- Let curators choose which collections appear in their 3D museum, so they can
-- swap rooms/wings in and out (the museum floor plan holds up to 3 wings × 3
-- galleries). Default on, so existing collections keep showing.
alter table galleries add column if not exists in_museum boolean not null default true;
