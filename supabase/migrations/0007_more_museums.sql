-- Register the key-based museums so saved artworks can reference them
-- (artworks.source_museum -> museums.slug foreign key).

insert into museums (slug, display_name, homepage_url, requires_api_key, sort_order)
values
  ('harvard',     'Harvard Art Museums',        'https://harvardartmuseums.org', true, 4),
  ('smithsonian', 'Smithsonian Open Access',    'https://www.si.edu/openaccess', true, 5),
  ('rijks',       'Rijksmuseum',                'https://www.rijksmuseum.nl',    true, 6)
on conflict (slug) do nothing;
