-- Seed the `museums` lookup table for every adapter slug, so the
-- artworks.source_museum foreign key is satisfied when saving pieces.
-- (Saving a Rijksmuseum/Harvard/Smithsonian/V&A piece failed because these
-- rows were missing.)

insert into museums (slug, display_name, homepage_url, requires_api_key, sort_order)
values
  ('met',         'The Metropolitan Museum of Art', 'https://www.metmuseum.org',    false, 1),
  ('artic',       'Art Institute of Chicago',       'https://www.artic.edu',        false, 2),
  ('cleveland',   'Cleveland Museum of Art',        'https://www.clevelandart.org', false, 3),
  ('rijks',       'Rijksmuseum',                    'https://www.rijksmuseum.nl',   false, 4),
  ('harvard',     'Harvard Art Museums',            'https://harvardartmuseums.org', true, 5),
  ('smithsonian', 'Smithsonian Open Access',        'https://www.si.edu',            true, 6),
  ('vam',         'Victoria and Albert Museum',     'https://www.vam.ac.uk',        false, 7)
on conflict (slug) do update
  set display_name    = excluded.display_name,
      homepage_url     = excluded.homepage_url,
      requires_api_key = excluded.requires_api_key,
      sort_order       = excluded.sort_order;
