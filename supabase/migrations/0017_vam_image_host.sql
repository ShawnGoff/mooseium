-- Allow the V&A's IIIF image host (framemark.vam.ac.uk) through the save-time
-- image validation added in 0015. Without this, saving a V&A piece is rejected
-- as "not a recognised museum source".

create or replace function public.mooseium_valid_image(url text)
returns boolean
language sql
immutable
as $$
  select url is null or url ~* '^https://([a-z0-9-]+\.)*(metmuseum\.org|artic\.edu|clevelandart\.org|micr\.io|harvard\.edu|harvardartmuseums\.org|si\.edu|vam\.ac\.uk)(/|:|$)';
$$;
