-- V&A ('vam') artworks are searchable but were rejected on save: the shared
-- save-validation guard's museum list never included 'vam' (migration 0017 added
-- the V&A image host to mooseium_valid_image, but not the museum slug here).
-- Recreate the guard with 'vam' allowed. (The museums lookup row for 'vam' and
-- the vam.ac.uk image host already exist from 0019 and 0017.)

create or replace function public.mooseium_validate_save(
  p_source_museum    text,
  p_title            text,
  p_artist           text,
  p_description      text,
  p_source_image_url text,
  p_image_thumb_url  text,
  p_image_medium_url text,
  p_image_large_url  text
) returns void
language plpgsql
immutable
as $$
begin
  if p_source_museum not in
     ('met', 'artic', 'cleveland', 'rijks', 'harvard', 'smithsonian', 'vam') then
    raise exception 'Unknown source museum';
  end if;

  if not (
    public.mooseium_valid_image(p_source_image_url)
    and public.mooseium_valid_image(p_image_thumb_url)
    and public.mooseium_valid_image(p_image_medium_url)
    and public.mooseium_valid_image(p_image_large_url)
  ) then
    raise exception 'Image URL is not a recognised museum source';
  end if;

  if char_length(coalesce(p_title, '')) > 400
     or char_length(coalesce(p_artist, '')) > 400
     or char_length(coalesce(p_description, '')) > 12000 then
    raise exception 'Field exceeds maximum length';
  end if;
end;
$$;
