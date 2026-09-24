-- Stop collecting the Discord user ID.
--
-- The id existed for one reason: discord.com/users/<id> is the only address
-- Discord has, so without it a username could not be made tappable. Keeping it
-- meant asking every user to turn on Developer Mode and copy an 18-digit
-- number, to buy a link on one field out of twenty.
--
-- Since unique usernames replaced the #1234 discriminator, a username is
-- enough to find someone: it is searched inside Discord rather than opened
-- from a link. So Discord now behaves like any handle that cannot be resolved
-- to an address -- it shows as plain text -- and the second input goes away.
--
-- The column is dropped rather than left in place. A column that is collected
-- but never projected is personal data held for no purpose, and this one has
-- no reader left. Rule 3 below is the projection rule that carried it.

-- Recreated without rule 3. Everything else is unchanged from 0002: the
-- self-guard, the "-" for a shared-but-empty field, and the absence of a
-- field-list argument.
create or replace function public.project_shared_profile(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_row   jsonb;
  v_out   jsonb := '{}'::jsonb;
  v_field public.profile_field;
  v_val   text;
  v_uid   uuid := auth.uid();
begin
  if v_uid is not null and v_uid <> p_user and not exists (
    select 1 from public.connections c
    where c.owner_id = v_uid and c.other_id = p_user
  ) then
    raise exception 'not authorised to read that profile' using errcode = '42501';
  end if;

  select to_jsonb(p) into v_row from public.profiles p where p.user_id = p_user;
  if v_row is null then
    return '{}'::jsonb;
  end if;

  for v_field in
    select s.field from public.profile_field_shares s
    where s.user_id = p_user and s.shareable order by s.field
  loop
    v_val := nullif(btrim(coalesce(v_row ->> (v_field::text), '')), '');
    v_out := v_out || jsonb_build_object(v_field::text, coalesce(v_val, '-'));
  end loop;

  return v_out;
end;
$fn$;

-- create or replace resets the grants, so put them back exactly as 0002 and
-- 0006 left them.
revoke all on function public.project_shared_profile(uuid) from public;
grant execute on function public.project_shared_profile(uuid) to authenticated;

-- Takes the check constraint and the column level UPDATE grant with it.
alter table public.profiles drop column if exists discord_id;
