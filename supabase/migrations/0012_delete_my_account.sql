-- Deleting your own account, from inside the app.
--
-- There was no way to leave. That is a blocker for real users on its own, and
-- both app stores require it of anything with accounts, so it would block a
-- native release later too.
--
-- Why this is a SECURITY DEFINER function rather than a DELETE the owner is
-- granted: the row that has to go is in `auth.users`, and nobody can be given
-- rights over their own row there without being given rights over everyone's.
-- So the function runs as the migration owner and deletes exactly one row, the
-- caller's, chosen by `auth.uid()` and not by an argument. There is no way to
-- ask it to delete somebody else, which is the whole reason it takes none.
--
-- What goes with it, all by cascade from 0001 and 0005:
--
--   profiles                -> the row itself
--   profile_field_shares    -> every toggle
--   connect_tokens          -> any live code
--   connect_presence        -> presence, if the screen was open
--   connections             -> both directions, so nobody keeps a card for a
--                              person who no longer exists
--   connection_notes        -> including the notes OTHER people wrote about
--                              you, because they hang off the connection. That
--                              is D10, decided deliberately and not a side
--                              effect: a note about someone is not much use
--                              once they are gone, and keeping it would mean
--                              keeping a record of a person who asked to be
--                              forgotten
--   reminders               -> both sides
--   one_on_one_requests     -> and their messages
--   push_tokens, push_outbox-> nothing left to notify
--
-- `exchanges` keeps rows with a null participant where the foreign key allows
-- it; those are already expired or settled and carry no profile content.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Order matters only for readability: the cascade from auth.users would take
  -- the profile anyway. Deleting the profile first makes the app's own data go
  -- before the identity it belonged to, which is the order someone would expect
  -- if they were watching.
  delete from public.profiles where user_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$fn$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
