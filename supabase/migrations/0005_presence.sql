-- Guy v2 — nearby connect, by presence.
--
-- Two people who have just spoken open the connect screen. Each sees the other
-- and one tap starts the exchange they both then confirm.
--
-- The thing that makes this work is not the location. It is that **both people
-- have the connect screen open right now**. That is the intent signal, and it
-- does nearly all the filtering: in a room of two hundred, the number of people
-- with that screen open at this moment is one or two.
--
-- Location only narrows the candidates, so it can be coarse. Indoors it may be
-- tens of metres out. That is fine.
--
-- Presence is deliberately thin and short lived. A row exists only while the
-- screen is open, it carries no history, and it is deleted when the screen
-- closes or the heartbeat stops. Nobody can read anyone else's row: the only
-- way to learn about another person is public.nearby_people(), which returns a
-- name and a rough distance and nothing else.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table public.connect_presence (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,

  -- Coarse, and optional: a browser may refuse the permission, and the flow
  -- still has to work. See `network_hint` for the fallback.
  lat        double precision,
  lng        double precision,
  accuracy_m double precision,

  -- A hash of whatever tells us two devices are on the same network, so two
  -- people on the same venue wifi can find each other with no location at all.
  -- Hashed because a raw address is more identifying than we need.
  network_hint text,

  started_at timestamptz not null default now(),
  seen_at    timestamptz not null default now(),

  constraint connect_presence_coords_together
    check ((lat is null) = (lng is null)),
  constraint connect_presence_lat_range check (lat is null or lat between -90 and 90),
  constraint connect_presence_lng_range check (lng is null or lng between -180 and 180)
);

create index connect_presence_seen_idx on public.connect_presence (seen_at desc);

comment on table public.connect_presence is
  'Who has the connect screen open right now. Exists only while that screen is open, holds no history, and is never readable by another user directly.';

-- How stale a heartbeat may be before someone stops counting as present.
-- Long enough to survive a slow network, short enough that a list never shows
-- someone who has walked away.
create or replace function public.presence_ttl()
returns interval language sql immutable as $fn$ select interval '45 seconds' $fn$;

-- ---------------------------------------------------------------------------
-- Distance
-- ---------------------------------------------------------------------------

-- Haversine, in metres. Written out rather than pulled from earthdistance so
-- this migration has no extension dependency.
create or replace function public.metres_between(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
as $fn$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 2 * 6371000 * asin(
      sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2)
        + cos(radians(lat1)) * cos(radians(lat2))
          * power(sin(radians(lng2 - lng1) / 2), 2)
      )
    )
  end;
$fn$;

-- How far apart two people may be and still appear to each other.
--
-- Generous on purpose. Indoor positioning is often tens of metres out, and
-- tightening this would mostly hide the person standing in front of you. The
-- mutual-screen-open requirement is what keeps the list short.
create or replace function public.nearby_radius_m()
returns double precision language sql immutable as $fn$ select 150.0 $fn$;

-- ---------------------------------------------------------------------------
-- Opening and closing the screen
-- ---------------------------------------------------------------------------

-- Called when the connect screen opens, and on a heartbeat while it is open.
create or replace function public.start_presence(
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_accuracy_m   double precision default null,
  p_network_hint text default null
)
returns public.connect_presence
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.connect_presence%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.connect_presence
    (user_id, lat, lng, accuracy_m, network_hint)
  values
    (v_uid, p_lat, p_lng, p_accuracy_m, nullif(btrim(p_network_hint), ''))
  on conflict (user_id) do update
     set lat = excluded.lat,
         lng = excluded.lng,
         accuracy_m = excluded.accuracy_m,
         network_hint = excluded.network_hint,
         seen_at = now()
  returning * into v_row;

  return v_row;
end;
$fn$;

-- Called when the screen closes. Leaving no trace is the point.
create or replace function public.end_presence()
returns void
language sql
security definer
set search_path = public
as $fn$
  delete from public.connect_presence where user_id = auth.uid();
$fn$;

-- ---------------------------------------------------------------------------
-- Who else is here
-- ---------------------------------------------------------------------------

-- The list on the connect screen.
--
-- Returns only people who ALSO have the screen open right now, and who are
-- either close enough by coordinates or on the same network. Each row carries a
-- name and a rough distance. Nothing else about them crosses, because nothing
-- has been agreed yet.
--
-- The name follows the same rule as everywhere else: it is shown only if they
-- currently share both name fields, and falls back to their username.
create or replace function public.nearby_people()
returns table (
  user_id           uuid,
  display_name      text,
  metres            double precision,
  same_network      boolean,
  already_connected boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_me  public.connect_presence%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_me from public.connect_presence p where p.user_id = v_uid;

  -- You are not on the screen, so there is no list. This is what stops
  -- presence being a directory you can browse without being visible yourself.
  if v_me.user_id is null or v_me.seen_at < now() - public.presence_ttl() then
    return;
  end if;

  return query
  select
    them.user_id,
    coalesce(
      (select nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '')
         from public.profiles pr
        where pr.user_id = them.user_id
          and exists (select 1 from public.profile_field_shares s
                       where s.user_id = them.user_id
                         and s.field = 'first_name' and s.shareable)
          and exists (select 1 from public.profile_field_shares s
                       where s.user_id = them.user_id
                         and s.field = 'last_name' and s.shareable)),
      (select pr.username from public.profiles pr where pr.user_id = them.user_id)
    ) as display_name,
    public.metres_between(v_me.lat, v_me.lng, them.lat, them.lng) as metres,
    (v_me.network_hint is not null and them.network_hint = v_me.network_hint)
      as same_network,
    exists (
      select 1 from public.connections c
      where c.owner_id = v_uid and c.other_id = them.user_id
    ) as already_connected
  from public.connect_presence them
  where them.user_id <> v_uid
    and them.seen_at >= now() - public.presence_ttl()
    and (
      public.metres_between(v_me.lat, v_me.lng, them.lat, them.lng)
        <= public.nearby_radius_m()
      or (v_me.network_hint is not null and them.network_hint = v_me.network_hint)
    )
  order by metres nulls last, them.seen_at desc;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Starting an exchange with someone on the list
-- ---------------------------------------------------------------------------

-- Opens a handshake with someone who is present and nearby.
--
-- This takes an account id, which every other connect path deliberately
-- refuses. The reason it is safe here is that the SERVER decides, not the
-- caller: both people must have the screen open right now, and must pass the
-- same proximity test the list uses. A client naming someone who is not on
-- their own list gets nowhere.
--
-- The residual risk, stated plainly: someone who both spoofs their coordinates
-- to your location and catches you with the screen open can raise a prompt on
-- your phone. They still cannot learn anything unless you tap confirm, and the
-- prompt names them. See Q19.
create or replace function public.open_nearby_exchange(p_target uuid)
returns table (status text, exchange_id uuid)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_target is null or p_target = v_uid then
    raise exception 'cannot exchange with yourself';
  end if;

  -- The list is the authority. If they are not on it, this does not happen.
  if not exists (
    select 1 from public.nearby_people() n where n.user_id = p_target
  ) then
    raise exception 'that person is not nearby any more';
  end if;

  if exists (
    select 1 from public.connections c
    where c.owner_id = v_uid and c.other_id = p_target
  ) then
    return query select 'already_connected'::text, null::uuid;
    return;
  end if;

  -- Reuse the existing pending exchange if one is already open between these
  -- two, so both tapping at once does not produce two prompts each.
  select e.id into v_id
  from public.exchanges e
  where e.state = 'pending'
    and e.expires_at > now()
    and ((e.initiator_id = v_uid and e.responder_id = p_target)
      or (e.initiator_id = p_target and e.responder_id = v_uid))
  order by e.created_at desc
  limit 1;

  if v_id is not null then
    return query select 'opened'::text, v_id;
    return;
  end if;

  insert into public.exchanges (method, initiator_id, responder_id, expires_at)
  values ('nearby', v_uid, p_target, now() + interval '30 seconds')
  returning id into v_id;

  return query select 'opened'::text, v_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.connect_presence enable row level security;

-- You may see and remove your own row, and nothing else. Reading anyone else's
-- goes through nearby_people(), which is the only place the proximity rules
-- are applied.
create policy presence_select_own on public.connect_presence
  for select using (user_id = (select auth.uid()));

create policy presence_delete_own on public.connect_presence
  for delete using (user_id = (select auth.uid()));

grant select, delete on public.connect_presence to authenticated;

grant execute on function public.start_presence(
  double precision, double precision, double precision, text
) to authenticated;
grant execute on function public.end_presence() to authenticated;
grant execute on function public.nearby_people() to authenticated;
grant execute on function public.open_nearby_exchange(uuid) to authenticated;
grant execute on function public.metres_between(
  double precision, double precision, double precision, double precision
) to authenticated;

-- ---------------------------------------------------------------------------
-- Hygiene
-- ---------------------------------------------------------------------------

-- Presence rows are meant to be transient. A phone that loses signal mid-screen
-- would otherwise leave one behind, and a stale row is someone appearing to be
-- somewhere they are not.
create or replace function public.purge_stale_presence()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  with gone as (
    delete from public.connect_presence
     where seen_at < now() - public.presence_ttl()
    returning 1
  )
  select count(*) into v_count from gone;

  return coalesce(v_count, 0);
end;
$fn$;

select cron.schedule(
  'guy-purge-stale-presence',
  '* * * * *',
  $cron$ select public.purge_stale_presence(); $cron$
);
