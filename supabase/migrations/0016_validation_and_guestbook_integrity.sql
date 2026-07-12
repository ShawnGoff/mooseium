-- Server-side validation the app previously only enforced in the browser, plus
-- column-level integrity on guestbook rows.

-- ---------------------------------------------------------------------------
-- 1. CHECK constraints (a client can talk to PostgREST directly, so these must
--    live in the database, not just in the React forms).
-- ---------------------------------------------------------------------------

alter table profiles drop constraint if exists username_format;
alter table profiles add constraint username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

alter table profiles drop constraint if exists username_not_reserved;
alter table profiles add constraint username_not_reserved
  check (username is null or lower(username) not in (
    'admin', 'administrator', 'mooseium', 'api', 'auth', 'support', 'help',
    'about', 'settings', 'account', 'login', 'logout', 'signin', 'signup',
    'museums', 'collections', 'g', 'root', 'system', 'moderator', 'staff'
  ));

alter table profiles drop constraint if exists display_name_len;
alter table profiles add constraint display_name_len
  check (display_name is null or char_length(display_name) <= 60);

alter table profiles drop constraint if exists bio_len;
alter table profiles add constraint bio_len
  check (bio is null or char_length(bio) <= 280);

alter table galleries drop constraint if exists gallery_name_len;
alter table galleries add constraint gallery_name_len
  check (char_length(name) between 1 and 120);

alter table placed_artworks drop constraint if exists note_len;
alter table placed_artworks add constraint note_len
  check (note is null or char_length(note) <= 2000);

alter table guestbook_entries drop constraint if exists gb_message_len;
alter table guestbook_entries add constraint gb_message_len
  check (message is null or char_length(message) <= 280);

alter table guestbook_entries drop constraint if exists gb_reply_len;
alter table guestbook_entries add constraint gb_reply_len
  check (owner_reply is null or char_length(owner_reply) <= 280);

alter table guestbook_entries drop constraint if exists gb_name_len;
alter table guestbook_entries add constraint gb_name_len
  check (display_name is null or char_length(display_name) <= 80);

-- ---------------------------------------------------------------------------
-- 2. Guestbook column integrity.
--    RLS controls WHICH rows each person may update, but it can't stop a
--    visitor from setting `owner_reply` on their own row (forging a curator
--    reply) or an owner from rewriting a visitor's `message`. This trigger
--    enforces who may change which columns, regardless of how the update
--    arrives (app or direct PostgREST call).
-- ---------------------------------------------------------------------------

create or replace function public.guestbook_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from galleries where id = old.gallery_id;

  if auth.uid() = old.user_id then
    -- The author may edit their own message, but never the curator's reply.
    new.owner_reply := old.owner_reply;
    new.user_id     := old.user_id;
    new.gallery_id  := old.gallery_id;
  elsif auth.uid() = v_owner then
    -- The gallery owner may set a reply, but never rewrite the visitor's words.
    new.message      := old.message;
    new.display_name := old.display_name;
    new.user_id      := old.user_id;
    new.gallery_id   := old.gallery_id;
  else
    raise exception 'Not allowed to modify this signature';
  end if;

  return new;
end;
$$;

drop trigger if exists guestbook_guard_trg on guestbook_entries;
create trigger guestbook_guard_trg
  before update on guestbook_entries
  for each row execute function public.guestbook_guard();
