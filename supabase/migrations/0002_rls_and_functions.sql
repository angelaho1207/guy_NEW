-- Guy v1 — row level security and the functions that cross privacy boundaries.
--
-- Rule of the house: no client ever writes to `exchanges`, `connections`,
-- `one_on_one_requests.status`, or anyone else's `profiles` row directly. Every
-- transition that involves two people's consent goes through a function in
-- this file, so the invariants live in one auditable place.

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.profiles             enable row level security;
alter table public.profile_field_shares enable row level security;
alter table public.qr_tokens            enable row level security;
alter table public.exchanges            enable row level security;
alter table public.connections          enable row level security;
alter table public.connection_notes     enable row level security;
alter table public.reminders            enable row level security;
alter table public.one_on_one_requests  enable row level security;
alter table public.one_on_one_messages  enable row level security;
alter table public.push_tokens          enable row level security;
alter table public.push_outbox          enable row level security;

-- push_outbox has RLS on and zero policies: it is service-role only.

-- ---------------------------------------------------------------------------
-- profiles — owner only, no exceptions
-- ---------------------------------------------------------------------------

create policy profiles_select_own on public.profiles
  for select using (user_id = (select auth.uid()));

create policy profiles_insert_own on public.profiles
  for insert with check (user_id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update using (user_id = (select auth.uid()))
           with check (user_id = (select auth.uid()));

-- Deliberately no delete policy: account deletion cascades from auth.users.

-- ---------------------------------------------------------------------------
-- profile_field_shares — owner only
-- ---------------------------------------------------------------------------

create policy field_shares_select_own on public.profile_field_shares
  for select using (user_id = (select auth.uid()));

create policy field_shares_update_own on public.profile_field_shares
  for update using (user_id = (select auth.uid()))
           with check (user_id = (select auth.uid()));

-- Inserts happen through the seeding trigger only.

-- ---------------------------------------------------------------------------
-- qr_tokens — you may mint and read your own; redeeming someone else's goes
-- through open_qr_exchange(), never a direct select.
-- ---------------------------------------------------------------------------

create policy qr_tokens_select_own on public.qr_tokens
  for select using (user_id = (select auth.uid()));

create policy qr_tokens_insert_own on public.qr_tokens
  for insert with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- exchanges — both parties may watch; only functions may write
-- ---------------------------------------------------------------------------

create policy exchanges_select_party on public.exchanges
  for select using (
    initiator_id = (select auth.uid()) or responder_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- connections — strictly the owner's. The other person never sees this row,
-- because it carries the owner's private notes, follow-up intent and context.
-- ---------------------------------------------------------------------------

create policy connections_select_own on public.connections
  for select using (owner_id = (select auth.uid()));

create policy connections_update_own on public.connections
  for update using (owner_id = (select auth.uid()))
           with check (owner_id = (select auth.uid()));

create policy connections_delete_own on public.connections
  for delete using (owner_id = (select auth.uid()));

-- Inserts happen only inside confirm_exchange().

-- ---------------------------------------------------------------------------
-- connection_notes — private to the owner of the parent connection
-- ---------------------------------------------------------------------------

create policy notes_all_own on public.connection_notes
  for all using (
    exists (
      select 1 from public.connections c
      where c.id = connection_notes.connection_id
        and c.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.connections c
      where c.id = connection_notes.connection_id
        and c.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- reminders — same ownership rule as notes
-- ---------------------------------------------------------------------------

create policy reminders_all_own on public.reminders
  for all using (
    exists (
      select 1 from public.connections c
      where c.id = reminders.connection_id
        and c.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.connections c
      where c.id = reminders.connection_id
        and c.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 1:1 requests and messages — visible to both parties, written by functions
-- ---------------------------------------------------------------------------

create policy one_on_one_select_party on public.one_on_one_requests
  for select using (
    requester_id = (select auth.uid()) or recipient_id = (select auth.uid())
  );

create policy one_on_one_messages_select_party on public.one_on_one_messages
  for select using (
    exists (
      select 1 from public.one_on_one_requests r
      where r.id = one_on_one_messages.request_id
        and ((select auth.uid()) in (r.requester_id, r.recipient_id))
    )
  );

-- A message may only be written by a party, as themselves, and only while the
-- scheduling window is actually open.
create policy one_on_one_messages_insert_party on public.one_on_one_messages
  for insert with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.one_on_one_requests r
      where r.id = one_on_one_messages.request_id
        and ((select auth.uid()) in (r.requester_id, r.recipient_id))
        and r.status in ('approved', 'scheduled')
        and (r.expires_at is null or now() < r.expires_at)
    )
  );

-- ---------------------------------------------------------------------------
-- push_tokens — owner only
-- ---------------------------------------------------------------------------

create policy push_tokens_all_own on public.push_tokens
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Profile bootstrap
-- ---------------------------------------------------------------------------

-- v1 auth is username + password. Supabase Auth is the password store (see
-- docs/03-decisions.md, D2), and the username travels in signup metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_username text;
begin
  v_username := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));

  if v_username !~ '^[a-z0-9._]{3,30}$' then
    raise exception 'invalid username: must be 3-30 chars of a-z, 0-9, dot or underscore';
  end if;

  insert into public.profiles (user_id, username) values (new.id, v_username);
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- The consent projection — the single place profile data crosses to someone else
-- ---------------------------------------------------------------------------

-- Returns the caller's currently-shareable field set. Used when freezing a
-- connection at exchange time.
create or replace function public.shareable_fields(p_user uuid)
returns public.profile_field[]
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(array_agg(field order by field), '{}'::public.profile_field[])
  from public.profile_field_shares
  where user_id = p_user and shareable;
$fn$;

-- Projects exactly `p_fields` of `p_user`'s profile into a jsonb object.
--
-- Two rules from the spec are enforced here and nowhere else:
--   1. Only the listed fields appear. Anything not listed does not exist as far
--      as the caller is concerned.
--   2. A listed field that is empty renders as "-" rather than being omitted,
--      so the reader can tell "they chose not to fill this in" apart from
--      "they chose not to share this".
--
-- This function is SECURITY DEFINER and is granted to `authenticated`, because
-- the views below run as their caller and so the caller needs EXECUTE. That
-- means a client can call it directly, with arguments of its choosing, so the
-- function cannot assume its caller passed an honest field set. It checks for
-- itself that the caller holds a connection to `p_user` whose frozen set
-- covers every field being asked for.
--
-- A null auth.uid() means a trusted server context: the scheduled jobs and the
-- service role, neither of which comes from a client.
create or replace function public.project_shared_profile(
  p_user   uuid,
  p_fields public.profile_field[]
)
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
  if v_uid is not null and not exists (
    select 1
    from public.connections c
    where c.owner_id = v_uid
      and c.other_id = p_user
      and coalesce(p_fields, '{}'::public.profile_field[]) <@ c.shared_fields
  ) then
    raise exception
      'not authorised to read those fields of that profile'
      using errcode = '42501';
  end if;

  select to_jsonb(p) into v_row from public.profiles p where p.user_id = p_user;

  if v_row is null then
    return '{}'::jsonb;
  end if;

  foreach v_field in array coalesce(p_fields, '{}'::public.profile_field[]) loop
    -- The enum label and the column name are identical by construction.
    v_val := nullif(btrim(coalesce(v_row ->> (v_field::text), '')), '');
    v_out := v_out || jsonb_build_object(v_field::text, coalesce(v_val, '-'));
  end loop;

  return v_out;
end;
$fn$;

-- The contacts list. security_invoker = true keeps RLS on `connections`
-- applying to the caller, so this view is guarded twice: once by that policy,
-- once by the frozen field set passed into the projection.
create or replace view public.contact_cards
with (security_invoker = true)
as
select
  c.id            as connection_id,
  c.other_id,
  c.met_via,
  c.shared_fields,
  c.how_we_met,
  c.how_we_met_on,
  c.want_follow_up,
  c.follow_up_topic,
  c.created_at,
  public.project_shared_profile(c.other_id, c.shared_fields) as card
from public.connections c;

-- ---------------------------------------------------------------------------
-- QR tokens
-- ---------------------------------------------------------------------------

-- Regenerated every time the code screen is opened. Short lived and single
-- use, so a screenshot of a code is not a reusable identity.
create or replace function public.mint_qr_token(p_ttl_seconds integer default 120)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_token text;
  v_exp   timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_ttl_seconds is null or p_ttl_seconds < 15 or p_ttl_seconds > 300 then
    raise exception 'ttl out of range';
  end if;

  -- Retire any still-live codes for this user, so only the code currently on
  -- screen can be redeemed.
  -- Columns are qualified because this function's OUT parameters are named
  -- `token` and `expires_at`, which would otherwise shadow the columns.
  update public.qr_tokens
     set expires_at = now()
   where qr_tokens.user_id = v_uid
     and qr_tokens.consumed_at is null
     and qr_tokens.expires_at > now();

  v_token := encode(gen_random_bytes(32), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');
  v_exp   := now() + make_interval(secs => p_ttl_seconds);

  insert into public.qr_tokens (token, user_id, expires_at)
  values (v_token, v_uid, v_exp);

  return query select v_token, v_exp;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Exchanges
-- ---------------------------------------------------------------------------

-- Scanning a code opens a handshake. It does not share anything: both people
-- still have to confirm in-app, inside the 30 second window.
create or replace function public.open_qr_exchange(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  update public.qr_tokens
     set consumed_at = now(), consumed_by = v_uid
   where token = p_token
     and consumed_at is null
     and expires_at > now()
  returning user_id into v_owner;

  if v_owner is null then
    raise exception 'qr code is expired or already used';
  end if;

  if v_owner = v_uid then
    raise exception 'cannot exchange with yourself';
  end if;

  insert into public.exchanges (method, initiator_id, responder_id, expires_at)
  values ('qr', v_uid, v_owner, now() + interval '30 seconds')
  returning id into v_id;

  return v_id;
end;
$fn$;

-- The UWB path. The Swift module resolves the nearby peer to a user id and
-- calls this. See open question Q7 about authenticating that peer id.
create or replace function public.open_uwb_exchange(p_other uuid)
returns uuid
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

  if p_other is null or p_other = v_uid then
    raise exception 'cannot exchange with yourself';
  end if;

  if not exists (select 1 from public.profiles where user_id = p_other) then
    raise exception 'unknown peer';
  end if;

  insert into public.exchanges (method, initiator_id, responder_id, expires_at)
  values ('uwb', v_uid, p_other, now() + interval '30 seconds')
  returning id into v_id;

  return v_id;
end;
$fn$;

-- Records one side's confirmation. When the second one lands, and only then,
-- both connection rows are created in the same transaction.
create or replace function public.confirm_exchange(p_exchange_id uuid)
returns public.exchange_state
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_ex  public.exchanges%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_ex from public.exchanges where id = p_exchange_id for update;

  if v_ex.id is null then
    raise exception 'unknown exchange';
  end if;

  if v_uid not in (v_ex.initiator_id, v_ex.responder_id) then
    raise exception 'not a party to this exchange';
  end if;

  if v_ex.state <> 'pending' then
    return v_ex.state;
  end if;

  -- The 30 second window. A late confirmation shares nothing.
  if now() >= v_ex.expires_at then
    update public.exchanges
       set state = 'expired', settled_at = now()
     where id = v_ex.id;
    return 'expired'::public.exchange_state;
  end if;

  if v_uid = v_ex.initiator_id then
    v_ex.initiator_confirmed_at := coalesce(v_ex.initiator_confirmed_at, now());
  else
    v_ex.responder_confirmed_at := coalesce(v_ex.responder_confirmed_at, now());
  end if;

  update public.exchanges
     set initiator_confirmed_at = v_ex.initiator_confirmed_at,
         responder_confirmed_at = v_ex.responder_confirmed_at
   where id = v_ex.id;

  if v_ex.initiator_confirmed_at is null or v_ex.responder_confirmed_at is null then
    return 'pending'::public.exchange_state;
  end if;

  -- Both sides are in. Freeze each person's current shareable set into the
  -- other person's row and create both directions together.
  insert into public.connections
    (owner_id, other_id, exchange_id, met_via, shared_fields)
  values
    (v_ex.initiator_id, v_ex.responder_id, v_ex.id, v_ex.method,
     public.shareable_fields(v_ex.responder_id)),
    (v_ex.responder_id, v_ex.initiator_id, v_ex.id, v_ex.method,
     public.shareable_fields(v_ex.initiator_id))
  on conflict (owner_id, other_id) do update
     set shared_fields = excluded.shared_fields,
         exchange_id   = excluded.exchange_id,
         met_via       = excluded.met_via,
         updated_at    = now();

  update public.exchanges
     set state = 'completed', settled_at = now()
   where id = v_ex.id;

  return 'completed'::public.exchange_state;
end;
$fn$;

create or replace function public.decline_exchange(p_exchange_id uuid)
returns public.exchange_state
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_ex  public.exchanges%rowtype;
begin
  select * into v_ex from public.exchanges where id = p_exchange_id for update;

  if v_ex.id is null then
    raise exception 'unknown exchange';
  end if;

  if v_uid not in (v_ex.initiator_id, v_ex.responder_id) then
    raise exception 'not a party to this exchange';
  end if;

  if v_ex.state <> 'pending' then
    return v_ex.state;
  end if;

  update public.exchanges
     set state = 'declined', settled_at = now()
   where id = v_ex.id;

  return 'declined'::public.exchange_state;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------

create or replace function public.set_reminder(
  p_connection_id uuid,
  p_days  integer,
  p_hours integer
)
returns public.reminders
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.reminders%rowtype;
begin
  if not exists (
    select 1 from public.connections
    where id = p_connection_id and owner_id = v_uid
  ) then
    raise exception 'connection not found';
  end if;

  -- The table constraints are the real guard; this is the friendly message.
  if p_days * 24 + p_hours < 1 then
    raise exception 'reminder must be at least 1 hour from now';
  end if;
  if p_days * 24 + p_hours > 168 then
    raise exception 'reminder may be at most 7 days from now';
  end if;

  insert into public.reminders (connection_id, days, hours, fire_at)
  values (
    p_connection_id, p_days, p_hours,
    now() + make_interval(days => p_days, hours => p_hours)
  )
  on conflict (connection_id) do update
     set days = excluded.days,
         hours = excluded.hours,
         fire_at = excluded.fire_at,
         fired_at = null,
         done_at = null,
         updated_at = now()
  returning * into v_row;

  return v_row;
end;
$fn$;

-- The running list of undone follow-ups: fired but not yet marked done.
create or replace view public.undone_follow_ups
with (security_invoker = true)
as
select
  r.id as reminder_id,
  c.id as connection_id,
  c.other_id,
  r.fire_at,
  r.fired_at,
  public.project_shared_profile(c.other_id, c.shared_fields) as card
from public.reminders r
join public.connections c on c.id = r.connection_id
where r.fired_at is not null and r.done_at is null;

-- ---------------------------------------------------------------------------
-- 1:1 requests
-- ---------------------------------------------------------------------------

create or replace function public.request_one_on_one(p_connection_id uuid)
returns public.one_on_one_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_conn public.connections%rowtype;
  v_row  public.one_on_one_requests%rowtype;
begin
  select * into v_conn
  from public.connections
  where id = p_connection_id and owner_id = v_uid;

  if v_conn.id is null then
    raise exception 'connection not found';
  end if;

  insert into public.one_on_one_requests
    (requester_id, recipient_id, connection_id)
  values (v_uid, v_conn.other_id, v_conn.id)
  returning * into v_row;

  insert into public.push_outbox (user_id, title, body, data)
  values (
    v_conn.other_id,
    'Guy',
    format('%s asked to set up a 1:1.',
           public.display_name_for(v_uid, v_conn.other_id)),
    jsonb_build_object('kind', 'one_on_one_request', 'request_id', v_row.id)
  );

  return v_row;
end;
$fn$;

create or replace function public.respond_one_on_one(
  p_request_id uuid,
  p_approve    boolean
)
returns public.one_on_one_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.one_on_one_requests%rowtype;
begin
  select * into v_row
  from public.one_on_one_requests
  where id = p_request_id for update;

  if v_row.id is null then
    raise exception 'unknown request';
  end if;

  if v_row.recipient_id <> v_uid then
    raise exception 'only the recipient may respond';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'request is no longer pending';
  end if;

  if p_approve then
    -- Both windows start counting from this moment, per spec.
    update public.one_on_one_requests
       set status = 'approved',
           approved_at = now(),
           expires_at = now() + interval '3 days',
           outer_limit_at = now() + interval '14 days'
     where id = v_row.id
    returning * into v_row;
  else
    update public.one_on_one_requests
       set status = 'declined', declined_at = now()
     where id = v_row.id
    returning * into v_row;
  end if;

  insert into public.push_outbox (user_id, title, body, data)
  values (
    v_row.requester_id,
    'Guy',
    format('%s %s your 1:1 request.',
           public.display_name_for(v_uid, v_row.requester_id),
           case when p_approve then 'approved' else 'declined' end),
    jsonb_build_object('kind', 'one_on_one_response', 'request_id', v_row.id)
  );

  return v_row;
end;
$fn$;

-- Accepting a proposed time closes the scheduling window.
create or replace function public.schedule_one_on_one(
  p_request_id uuid,
  p_when       timestamptz
)
returns public.one_on_one_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.one_on_one_requests%rowtype;
begin
  select * into v_row
  from public.one_on_one_requests
  where id = p_request_id for update;

  if v_row.id is null then
    raise exception 'unknown request';
  end if;

  if v_uid not in (v_row.requester_id, v_row.recipient_id) then
    raise exception 'not a party to this request';
  end if;

  if v_row.status not in ('approved', 'scheduled') then
    raise exception 'request is not open for scheduling';
  end if;

  if now() >= v_row.expires_at then
    raise exception 'the 3 day scheduling window has closed';
  end if;

  if p_when <= now() then
    raise exception 'pick a time in the future';
  end if;

  if p_when > v_row.outer_limit_at then
    raise exception 'the 1:1 must fall within 2 weeks of approval';
  end if;

  update public.one_on_one_requests
     set status = 'scheduled', scheduled_for = p_when, scheduled_at = now()
   where id = v_row.id
  returning * into v_row;

  insert into public.push_outbox (user_id, title, body, data)
  select
    party,
    'Guy',
    format('Your 1:1 is set for %s.', to_char(p_when, 'Mon DD at HH24:MI')),
    jsonb_build_object('kind', 'one_on_one_scheduled', 'request_id', v_row.id)
  from unnest(array[v_row.requester_id, v_row.recipient_id]) as party
  where party <> v_uid;

  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Name resolution for notifications
-- ---------------------------------------------------------------------------

-- What `p_viewer` is allowed to see `p_subject` called. Falls back to the
-- username when the name field was not shared or is blank, so a notification
-- never leaks a name the viewer has no right to.
create or replace function public.display_name_for(p_subject uuid, p_viewer uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_name text;
begin
  select nullif(btrim(p.name), '')
    into v_name
  from public.connections c
  join public.profiles p on p.user_id = c.other_id
  where c.owner_id = p_viewer
    and c.other_id = p_subject
    and 'name' = any (c.shared_fields);

  if v_name is not null then
    return v_name;
  end if;

  select username into v_name from public.profiles where user_id = p_subject;
  return coalesce(v_name, 'your contact');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- RLS policies decide which ROWS a role may touch; grants decide whether it
-- may touch the table at all. Both are required, and they are spelled out here
-- rather than inherited from a blanket default, so that the privilege surface
-- is reviewable in one place.

grant usage on schema public to authenticated;

-- Several of these are deliberately COLUMN level. A row policy answers "is
-- this your row"; it does not answer "may you change this particular field of
-- your own row". Three columns here are owned by the system even though they
-- sit on a row the user owns, and a blanket table-level UPDATE would hand them
-- over:
--
--   connections.shared_fields  -- the other person's consent, recorded. If the
--                                 owner could widen it, they could project
--                                 that person's entire profile.
--   connections.other_id       -- who the row is about.
--   reminders.fire_at          -- the 1 hour to 7 days rule lives in
--                                 set_reminder(); a writable fire_at routes
--                                 around it.
--   profiles.username          -- identity, not profile content.

grant select on public.profiles to authenticated;
grant insert on public.profiles to authenticated;
grant update (
  name, school, societies, major, class_year, affiliations, hometown,
  currently_into, want_to_learn, figuring_out,
  linkedin, x, discord, instagram, phone, work_email, personal_email,
  updated_at
) on public.profiles to authenticated;

grant select on public.profile_field_shares to authenticated;
grant update (shareable, updated_at) on public.profile_field_shares to authenticated;

grant select, insert on public.qr_tokens to authenticated;
grant select         on public.exchanges to authenticated;

grant select, delete on public.connections to authenticated;
grant update (
  how_we_met, how_we_met_on, want_follow_up, follow_up_topic, updated_at
) on public.connections to authenticated;

grant select, insert, update, delete on public.connection_notes to authenticated;

-- Reminders are created and rescheduled only through set_reminder(). The one
-- thing a client may change directly is marking the follow-up done.
grant select, delete on public.reminders to authenticated;
grant update (done_at, updated_at) on public.reminders to authenticated;

grant select         on public.one_on_one_requests to authenticated;
grant select, insert on public.one_on_one_messages to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;

-- Deliberately never granted to authenticated:
--   public.push_outbox     -- service role drains it
--   insert on connections  -- only confirm_exchange() may create one
--   insert on reminders    -- only set_reminder() may, so the bounds hold
--   any write on exchanges -- only the exchange functions may transition state
--   any write on one_on_one_requests -- only the 1:1 functions may

revoke all on function public.project_shared_profile(uuid, public.profile_field[]) from public;
revoke all on function public.shareable_fields(uuid) from public;
revoke all on function public.display_name_for(uuid, uuid) from public;

grant execute on function public.project_shared_profile(uuid, public.profile_field[]) to authenticated;
grant execute on function public.shareable_fields(uuid) to authenticated;
grant execute on function public.mint_qr_token(integer) to authenticated;
grant execute on function public.open_qr_exchange(text) to authenticated;
grant execute on function public.open_uwb_exchange(uuid) to authenticated;
grant execute on function public.confirm_exchange(uuid) to authenticated;
grant execute on function public.decline_exchange(uuid) to authenticated;
grant execute on function public.set_reminder(uuid, integer, integer) to authenticated;
grant execute on function public.request_one_on_one(uuid) to authenticated;
grant execute on function public.respond_one_on_one(uuid, boolean) to authenticated;
grant execute on function public.schedule_one_on_one(uuid, timestamptz) to authenticated;

grant select on public.contact_cards to authenticated;
grant select on public.undone_follow_ups to authenticated;
