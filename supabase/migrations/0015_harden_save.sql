-- Harden the security-definer save functions against direct RPC abuse.
--
-- These functions run with admin rights (they must, to write the shared
-- `artworks` catalog), and PostgREST exposes them to any signed-in user. Without
-- validation, someone could call them directly with a fabricated title and an
-- arbitrary (e.g. NSFW) image URL, which would then surface in everyone's
-- "Popular right now" feed. We add in-function checks so only real museum
-- content can enter the catalog:
--   * source_museum must be one of the known adapters
--   * every image URL must live on a known museum image host
--   * text fields are length-capped
--   * rights_status is coerced to a known value

-- Image-host allowlist. Accepts null (some records lack a given size) or an
-- https URL whose host ends in a trusted museum domain (tolerates subdomains
-- like images.metmuseum.org, iiif.micr.io, ids.lib.harvard.edu).
create or replace function public.mooseium_valid_image(url text)
returns boolean
language sql
immutable
as $$
  select url is null or url ~* '^https://([a-z0-9-]+\.)*(metmuseum\.org|artic\.edu|clevelandart\.org|micr\.io|harvard\.edu|harvardartmuseums\.org|si\.edu)(/|:|$)';
$$;

-- Shared guard: raises if the incoming payload isn't plausibly real museum data.
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
     ('met', 'artic', 'cleveland', 'rijks', 'harvard', 'smithsonian') then
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

-- Rebuild save_artwork_to_gallery with validation up front.
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
  v_rights text := case
    when p_rights_status in ('cc0', 'public_domain', 'open_access', 'unknown')
    then p_rights_status else 'unknown' end;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.mooseium_validate_save(
    p_source_museum, p_title, p_artist, p_description,
    p_source_image_url, p_image_thumb_url, p_image_medium_url, p_image_large_url
  );

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
    coalesce(p_tags, '{}'), v_rights, p_license, p_attribution,
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

  return v_artwork_id;
end;
$$;

-- Rebuild the standalone save_artwork with the same guard.
create or replace function public.save_artwork(
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
  v_rights text := case
    when p_rights_status in ('cc0', 'public_domain', 'open_access', 'unknown')
    then p_rights_status else 'unknown' end;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.mooseium_validate_save(
    p_source_museum, p_title, p_artist, p_description,
    p_source_image_url, p_image_thumb_url, p_image_medium_url, p_image_large_url
  );

  insert into artworks (
    source_museum, museum_object_id, title, artist, date_text, medium, culture,
    dimensions, object_type, description, credit_line, tags, rights_status,
    license, attribution, source_image_url, image_thumb_url, image_medium_url,
    image_large_url, aspect_ratio, source_url, processing_status, raw_metadata
  )
  values (
    p_source_museum, p_museum_object_id, p_title, p_artist, p_date_text, p_medium,
    p_culture, p_dimensions, p_object_type, p_description, p_credit_line,
    coalesce(p_tags, '{}'), v_rights, p_license, p_attribution,
    p_source_image_url, p_image_thumb_url, p_image_medium_url, p_image_large_url,
    p_aspect_ratio, p_source_url, 'ready', coalesce(p_raw_metadata, '{}'::jsonb)
  )
  on conflict (source_museum, museum_object_id)
    do update set title = excluded.title
  returning id into v_artwork_id;

  insert into saved_artworks (user_id, artwork_id)
  values (v_uid, v_artwork_id)
  on conflict (user_id, artwork_id) do nothing;

  return v_artwork_id;
end;
$$;
