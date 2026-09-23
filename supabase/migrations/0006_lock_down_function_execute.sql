-- Close the EXECUTE surface on every function in `public`.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default. `public` here
-- means every role, including Supabase's `anon`, which is the role a
-- logged-out visitor gets. So until now every function in this schema was
-- callable by anyone on the internet holding the anon key, which is a key that
-- ships in the browser bundle and is meant to be public.
--
-- Nothing leaked, because each function checks its own caller rather than
-- trusting that something upstream did. That is the whole reason for the
-- `if auth.uid() is null then raise` lines, and it is why this is a hardening
-- pass rather than an incident. Two things were still wrong:
--
--   * `name_for()` answered logged-out callers. Given a user id it would fall
--     through to the username, so an anonymous caller holding a uuid could
--     confirm the account existed and learn its handle.
--   * The scheduled job functions were callable by anyone. They are written to
--     be idempotent and only act on rows that are already due, so the worst
--     case was someone doing pg_cron's job early, but a client has no business
--     reaching them at all.
--
-- After this migration the rule is the one the rest of the schema already
-- follows: nothing is reachable unless it was granted deliberately, and the
-- grant list is the reviewable record of what a client may do.

-- ---------------------------------------------------------------------------
-- Revoke everything, from everyone
-- ---------------------------------------------------------------------------

-- Done as a loop rather than a list so a function added later cannot be missed
-- by forgetting to add a line here. The owner keeps EXECUTE regardless, which
-- is what lets pg_cron and the triggers keep working.
do $revoke$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public', r.sig);

    -- These exist on Supabase and not in a bare Postgres, so they are only
    -- revoked when present. The tests create both to match production.
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', r.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', r.sig);
    end if;
  end loop;
end
$revoke$;

-- ---------------------------------------------------------------------------
-- Grant back, deliberately
-- ---------------------------------------------------------------------------

-- What a signed-in client is allowed to call. Anything not on this list is
-- internal, and anything a logged-out visitor may call is nothing at all:
-- signing up and signing in go through Supabase Auth, not through here.

-- Reading another person, which self-guards on having a connection.
grant execute on function public.project_shared_profile(uuid) to authenticated;

-- Naming someone, pinned to the caller as the viewer.
grant execute on function public.name_for(uuid) to authenticated;
grant execute on function public.exchange_peer_name(uuid) to authenticated;

-- Connecting.
grant execute on function public.mint_connect_token(integer) to authenticated;
grant execute on function public.open_exchange(text, public.exchange_method) to authenticated;
grant execute on function public.confirm_exchange(uuid) to authenticated;
grant execute on function public.decline_exchange(uuid) to authenticated;

-- Nearby.
grant execute on function public.start_presence(
  double precision, double precision, double precision, text
) to authenticated;
grant execute on function public.end_presence() to authenticated;
grant execute on function public.nearby_people() to authenticated;
grant execute on function public.open_nearby_exchange(uuid) to authenticated;

-- Reminders.
grant execute on function public.set_reminder(uuid, integer, integer) to authenticated;
grant execute on function public.complete_follow_up(uuid) to authenticated;

-- 1:1s.
grant execute on function public.request_one_on_one(uuid) to authenticated;
grant execute on function public.respond_one_on_one(uuid, boolean) to authenticated;
grant execute on function public.schedule_one_on_one(uuid, timestamptz) to authenticated;

-- Deliberately granted to nobody, and the reason for each:
--
--   display_name_for(uuid, uuid)  takes the viewer as an argument, so a client
--                                 could ask what someone else can see.
--                                 name_for() is the caller-pinned version.
--   shareable_fields(uuid)        internal to connection creation.
--   metres_between(...)           internal to nearby_people().
--   presence_ttl(), nearby_radius_m()  internal constants.
--   fire_due_reminders()          pg_cron's, not a client's.
--   expire_stale_one_on_ones()    same.
--   expire_stale_exchanges()      same.
--   purge_spent_connect_tokens()  same.
--   purge_stale_presence()        same.
--   handle_new_user()             a trigger on auth.users.
--   seed_profile_field_shares()   a trigger on profiles.
