-- Never derive a display name from someone's email address.
-- New signups only get a name from their OAuth profile (e.g. Google full name);
-- otherwise the name is left blank until the user sets one.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Clear any existing display names that were auto-generated from an email prefix.
update public.profiles p
set display_name = null
from auth.users u
where u.id = p.id
  and p.display_name is not null
  and p.display_name = split_part(u.email, '@', 1);
