-- get_popular_artworks: the most-saved pieces across all users, for the
-- front-page discovery feed. Security definer so it can count saves (which are
-- private per-user under RLS) while only returning public catalog rows.

create or replace function public.get_popular_artworks(p_limit int default 12)
returns setof artworks
language sql
security definer
set search_path = public
as $$
  select a.*
  from artworks a
  left join (
    select artwork_id, count(*) as saves
    from saved_artworks
    group by artwork_id
  ) s on s.artwork_id = a.id
  where a.processing_status = 'ready'
    and a.image_thumb_url is not null
  order by coalesce(s.saves, 0) desc, a.created_at desc
  limit greatest(1, least(p_limit, 48));
$$;
