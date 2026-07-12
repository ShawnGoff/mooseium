-- Bump a collection's updated_at whenever a piece is saved into it, so the
-- most-recently-used collection can sort to the top.

create or replace function public.save_artwork_to_gallery(
  p_gallery_id            uuid,
  p_source_museum         text,
  p_museum_object_id      text,
  p_title                 text,
  p_artist                text,
  p_date_text             text,
  p_medium                text,
  p_culture               text,
  p_dimensions            text,
  p_object_type           text,
  p_description           text,
  p_credit_line           text,
  p_tags                  text[],
  p_rights_status         text,
  p_license               text,
  p_attribution           text,
  p_source_image_url      text,
  p_image_thumb_url       text,
  p_image_medium_url      text,
  p_image_large_url       text,
  p_aspect_ratio          double precision,
  p_source_url            text,
  p_raw_metadata          jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_artwork_id uuid;
  v_next_order integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from galleries where id = p_gallery_id and user_id = v_uid
  ) then
    raise exception 'Collection not found';
  end if;

  insert into artworks (
    source_museum, museum_object_id, title, artist, date_text, medium, culture,
    dimensions, object_type, description, credit_line, tags, rights_status,
    license, attribution, source_image_url, image_thumb_url, image_medium_url,
    image_large_url, aspect_ratio, source_url, processing_status, raw_metadata
  )
  values (
    p_source_museum, p_museum_object_id, p_title, p_artist, p_date_text, p_medium,
    p_culture, p_dimensions, p_object_type, p_description, p_credit_line,
    coalesce(p_tags, '{}'), p_rights_status, p_license, p_attribution,
    p_source_image_url, p_image_thumb_url, p_image_medium_url, p_image_large_url,
    p_aspect_ratio, p_source_url, 'ready', coalesce(p_raw_metadata, '{}'::jsonb)
  )
  on conflict (source_museum, museum_object_id)
    do update set title = excluded.title
  returning id into v_artwork_id;

  insert into saved_artworks (user_id, artwork_id)
  values (v_uid, v_artwork_id)
  on conflict (user_id, artwork_id) do nothing;

  select coalesce(max(sort_order) + 1, 0) into v_next_order
  from placed_artworks where gallery_id = p_gallery_id;

  insert into placed_artworks (gallery_id, artwork_id, sort_order)
  values (p_gallery_id, v_artwork_id, v_next_order)
  on conflict (gallery_id, artwork_id) do nothing;

  -- Mark this collection as most-recently used.
  update galleries set updated_at = now() where id = p_gallery_id;

  return v_artwork_id;
end;
$$;
