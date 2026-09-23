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
alter table public.connect_tokens       enable row level security;
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
-- connect_tokens — you may mint and read your own; redeeming someone else's
-- goes through open_exchange(), never a direct select.
-- ---------------------------------------------------------------------------

create policy connect_tokens_select_own on public.connect_tokens
  for select using (user_id = (select auth.uid()));

create policy connect_tokens_insert_own on public.connect_tokens
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
  v_username   text;
  v_first_name text;
  v_last_name  text;
begin
  v_username   := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_first_name := btrim(coalesce(new.raw_user_meta_data ->> 'first_name', ''));
  v_last_name  := btrim(coalesce(new.raw_user_meta_data ->> 'last_name', ''));

  if v_username !~ '^[a-z0-9._]{3,30}$' then
    raise exception 'invalid username: must be 3-30 chars of a-z, 0-9, dot or underscore';
  end if;

  -- First and last name are the only required profile content, so signup is
  -- the one place they can be collected. A profile cannot exist without them.
  if v_first_name = '' or v_last_name = '' then
    raise exception 'first name and last name are required';
  end if;

  insert into public.profiles (user_id, username, first_name, last_name)
  values (new.id, v_username, v_first_name, v_last_name);

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

-- Projects everything `p_user` is CURRENTLY sharing into a jsonb object.
--
-- Three rules are enforced here and nowhere else:
--
--   1. A field appears if and only if its owner's shareable toggle is on right
--      now. Turning a toggle off hides that field from everyone who has it,
--      immediately. Turning it on reveals it to everyone, immediately, even to
--      people met while it was off. There is no per-connection field set:
--      `connections.fields_at_exchange` is a historical record and is
--      deliberately not consulted here.
--
--   2. A shared field that is empty renders as "-" rather than being omitted,
--      so the reader can tell "they chose not to fill this in" apart from
--      "they chose not to share this". A field that is NOT shared is absent
--      entirely, never "-".
--
--   3. Sharing `discord` carries `discord_id` with it, because the id is what
--      makes the username tappable and is meaningless on its own.
--
-- Note there is no field-list argument. An earlier version took one, which
-- meant a client calling this directly could ask for a set of its own
-- choosing and the function had to defend itself against its own caller. With
-- visibility driven entirely by the subject's toggles, the argument has no
-- reason to exist, and the whole class of problem goes with it.
--
-- The remaining check is that the caller is connected to `p_user` at all. A
-- null auth.uid() means a trusted server context: the scheduled jobs and the
-- service role, neither of which comes from a client.
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
    select 1
    from public.connections c
    where c.owner_id = v_uid
      and c.other_id = p_user
  ) then
    raise exception
      'not authorised to read that profile'
      using errcode = '42501';
  end if;

  select to_jsonb(p) into v_row from public.profiles p where p.user_id = p_user;

  if v_row is null then
    return '{}'::jsonb;
  end if;

  for v_field in
    select s.field
    from public.profile_field_shares s
    where s.user_id = p_user and s.shareable
    order by s.field
  loop
    -- The enum label and the column name are identical by construction.
    v_val := nullif(btrim(coalesce(v_row ->> (v_field::text), '')), '');
    v_out := v_out || jsonb_build_object(v_field::text, coalesce(v_val, '-'));

    -- Rule 3.
    if v_field = 'discord' then
      v_val := nullif(btrim(coalesce(v_row ->> 'discord_id', '')), '');
      if v_val is not null then
        v_out := v_out || jsonb_build_object('discord_id', v_val);
      end if;
    end if;
  end loop;

  return v_out;
end;
$fn$;

-- The contacts list. security_invoker = true keeps RLS on `connections`
-- applying to the caller, so this view is guarded twice: once by that policy,
-- once by the projection, which returns only what its subject currently shares.
create or replace view public.contact_cards
with (security_invoker = true)
as
select
  c.id            as connection_id,
  c.other_id,
  -- Identity, not profile content, and not a shareable field. Notifications
  -- already fall back to it when a name is withheld (display_name_for), so the
  -- UI needs it for the same reason: to have something to call someone.
  (select p.username from public.profiles p where p.user_id = c.other_id) as username,
  c.met_via,
  c.fields_at_exchange,
  c.how_we_met,
  c.how_we_met_on,
  c.want_follow_up,
  c.follow_up_topic,
  c.created_at,
  public.project_shared_profile(c.other_id) as card
from public.connections c;

-- ---------------------------------------------------------------------------
-- Connect tokens
-- ---------------------------------------------------------------------------

-- Mints the token that proves which account this phone belongs to.
--
-- Called when the connect screen opens, on either path: it becomes the QR
-- code, or it is broadcast over Bluetooth during Nearby Interaction discovery.
-- Minting retires this user's previous live token, so only what is currently
-- on screen, or currently being broadcast, can be redeemed.
--
-- The UWB path broadcasts continuously while the screen is open, so a client
-- that keeps that screen up past the TTL must re-mint. That is deliberate:
-- a Bluetooth broadcast can be overheard at range, unlike a QR code that has
-- to be pointed at, so its useful lifetime is kept short rather than stretched
-- for convenience.
create or replace function public.mint_connect_token(p_ttl_seconds integer default 120)
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

  -- Columns are qualified because this function's OUT parameters are named
  -- `token` and `expires_at`, which would otherwise shadow the columns.
  update public.connect_tokens
     set expires_at = now()
   where connect_tokens.user_id = v_uid
     and connect_tokens.consumed_at is null
     and connect_tokens.expires_at > now();

  v_token := encode(gen_random_bytes(32), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');
  v_exp   := now() + make_interval(secs => p_ttl_seconds);

  insert into public.connect_tokens (token, user_id, expires_at)
  values (v_token, v_uid, v_exp);

  return query select v_token, v_exp;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Exchanges
-- ---------------------------------------------------------------------------

-- Opens a handshake, on either path.
--
-- Both paths redeem a connect token. Neither accepts an account id, so a
-- client cannot name a person it is not standing next to: it has to present a
-- token it could only have obtained by reading their screen or by being in
-- Bluetooth range of their phone.
--
-- `p_method` only records how the two met, for the connection row and for the
-- UI. It is not a trust input, and a client that misreports it gains nothing.
--
-- Opening shares nothing. Both people still confirm, inside the 30 second
-- window, and only the second confirmation creates anything.
--
-- Returns ('already_connected', null) when these two already have each other,
-- so the app can show a plain "Already connected!" and stop. No prompt is
-- raised on either phone, and the token is left unspent, so a mistaken scan or
-- tap does not cost the other person their live token.
create or replace function public.open_exchange(
  p_token  text,
  p_method public.exchange_method
)
returns table (status text, exchange_id uuid)
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

  -- Locked, then consumed only if the exchange actually opens.
  select t.user_id into v_owner
  from public.connect_tokens t
  where t.token = p_token
    and t.consumed_at is null
    and t.expires_at > now()
  for update;

  if v_owner is null then
    raise exception 'that connect code is expired or already used';
  end if;

  if v_owner = v_uid then
    raise exception 'cannot exchange with yourself';
  end if;

  if exists (
    select 1 from public.connections c
    where c.owner_id = v_uid and c.other_id = v_owner
  ) then
    return query select 'already_connected'::text, null::uuid;
    return;
  end if;

  update public.connect_tokens t
     set consumed_at = now(), consumed_by = v_uid
   where t.token = p_token;

  insert into public.exchanges (method, initiator_id, responder_id, expires_at)
  values (p_method, v_uid, v_owner, now() + interval '30 seconds')
  returning id into v_id;

  return query select 'opened'::text, v_id;
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
  --
  -- `do nothing` on conflict, not `do update`. An already-connected pair is
  -- turned away by open_*_exchange() before a prompt is ever raised, so
  -- reaching this line with an existing row means two handshakes raced. In
  -- that case the safe move is to leave the existing row alone rather than
  -- overwrite its history and its owner's notes.
  insert into public.connections
    (owner_id, other_id, exchange_id, met_via, fields_at_exchange)
  values
    (v_ex.initiator_id, v_ex.responder_id, v_ex.id, v_ex.method,
     public.shareable_fields(v_ex.responder_id)),
    (v_ex.responder_id, v_ex.initiator_id, v_ex.id, v_ex.method,
     public.shareable_fields(v_ex.initiator_id))
  on conflict (owner_id, other_id) do nothing;

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

-- Sets or replaces the single reminder on a connection.
--
-- A connection has one reminder slot. Marking a follow-up done frees it: the
-- row stays so the in-app list can show what was completed, and the next call
-- here overwrites it and clears the fired and done stamps, so a fresh reminder
-- behaves exactly like a first one. See public.complete_follow_up().
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

-- Marks a fired follow-up done, which frees the connection's reminder slot.
--
-- A client can equally set `done_at` directly, which its column grant allows.
-- This exists so the common action has one obvious name and so the "only your
-- own connection" check lives somewhere rather than being implied by RLS.
create or replace function public.complete_follow_up(p_connection_id uuid)
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

  update public.reminders
     set done_at = now(), updated_at = now()
   where connection_id = p_connection_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'no reminder on that connection';
  end if;

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
  public.project_shared_profile(c.other_id) as card
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

  -- Approval notifies. A decline does not: it simply disappears from both
  -- lists, with nothing sent and nothing left saying "declined". Turning
  -- someone down should not come with an announcement.
  if p_approve then
    insert into public.push_outbox (user_id, title, body, data)
    values (
      v_row.requester_id,
      'Guy',
      format('%s approved your 1:1 request.',
             public.display_name_for(v_uid, v_row.requester_id)),
      jsonb_build_object('kind', 'one_on_one_response', 'request_id', v_row.id)
    );
  end if;

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

-- The 1:1 requests either person should actually see.
--
-- A declined request disappears from both people's lists rather than sitting
-- there reading "declined". The row is kept, not deleted, because it is what
-- makes the pair eligible to send a new request and it is worth having if a
-- dispute ever arises. It is simply never listed. Clients read this view
-- rather than the table, so "disappears" is structural rather than a filter
-- each screen has to remember.
--
-- Expired requests are listed, because someone who agreed to meet and then ran
-- out of time should be told so.
create or replace view public.visible_one_on_ones
with (security_invoker = true)
as
select
  r.id,
  r.requester_id,
  r.recipient_id,
  r.connection_id,
  r.status,
  r.created_at,
  r.approved_at,
  r.expires_at,
  r.outer_limit_at,
  r.scheduled_for,
  r.scheduled_at
from public.one_on_one_requests r
where r.status <> 'declined';

-- ---------------------------------------------------------------------------
-- Name resolution for notifications
-- ---------------------------------------------------------------------------

-- What `p_viewer` is allowed to see `p_subject` called: "[First] [Last]", per
-- the notification copy in the brief.
--
-- Both name fields are required, so they are never blank. They are still
-- ordinary shareable fields, though, and sharing can be revoked after the
-- fact, so this applies the same test as the projection: are both name fields
-- shareable right now. A push notification must never carry a name the
-- recipient is no longer allowed to see, which is why this does not just read
-- the profile.
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
  select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
    into v_name
  from public.connections c
  join public.profiles p on p.user_id = c.other_id
  where c.owner_id = p_viewer
    and c.other_id = p_subject
    and exists (
      select 1 from public.profile_field_shares s
      where s.user_id = p_subject and s.field = 'first_name' and s.shareable
    )
    and exists (
      select 1 from public.profile_field_shares s
      where s.user_id = p_subject and s.field = 'last_name' and s.shareable
    );

  if v_name is not null then
    return v_name;
  end if;

  select username into v_name from public.profiles where user_id = p_subject;
  return coalesce(v_name, 'your contact');
end;
$fn$;

-- What the CALLER may see `p_subject` called.
--
-- display_name_for() takes the viewer as an argument, which is right for the
-- scheduled jobs that queue a push on someone else's behalf, but wrong to hand
-- to a client: passing someone else as the viewer would reveal whether those
-- two are connected, and what one calls the other. This wrapper pins the
-- viewer to auth.uid(), and it is the only one of the pair clients may call.
create or replace function public.name_for(p_subject uuid)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select public.display_name_for(p_subject, auth.uid());
$fn$;

-- The name to put on a confirmation prompt.
--
-- name_for() falls back to a username when the caller has no connection to the
-- subject, and during an exchange there deliberately is not one yet. But the
-- prompt is the consent moment: "Share with alice?" is a worse question than
-- "Share with Alice Alvarez?", and answering it well depends on knowing who is
-- asking.
--
-- Only a party to the exchange may ask, and the answer still respects the other
-- person's toggles: a withheld name falls back to their username, the same as
-- everywhere else.
create or replace function public.exchange_peer_name(p_exchange_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_peer uuid;
  v_name text;
begin
  select case when e.initiator_id = v_uid then e.responder_id else e.initiator_id end
    into v_peer
  from public.exchanges e
  where e.id = p_exchange_id
    and v_uid in (e.initiator_id, e.responder_id);

  if v_peer is null then
    raise exception 'not a party to this exchange' using errcode = '42501';
  end if;

  select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
    into v_name
  from public.profiles p
  where p.user_id = v_peer
    and exists (
      select 1 from public.profile_field_shares s
      where s.user_id = v_peer and s.field = 'first_name' and s.shareable
    )
    and exists (
      select 1 from public.profile_field_shares s
      where s.user_id = v_peer and s.field = 'last_name' and s.shareable
    );

  if v_name is not null then
    return v_name;
  end if;

  select username into v_name from public.profiles where user_id = v_peer;
  return coalesce(v_name, 'someone');
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
--   connections.fields_at_exchange -- a record of what was shared that day.
--                                 It no longer gates visibility, but it is
--                                 still a record, not the owner's to rewrite.
--   connections.other_id       -- who the row is about.
--   reminders.fire_at          -- the 1 hour to 7 days rule lives in
--                                 set_reminder(); a writable fire_at routes
--                                 around it.
--   profiles.username          -- identity, not profile content.

grant select on public.profiles to authenticated;
grant insert on public.profiles to authenticated;
grant update (
  first_name, last_name, school, societies, major, class_year, affiliations,
  hometown,
  currently_into, want_to_learn, figuring_out,
  linkedin, x, discord, discord_id, instagram, phone, work_email,
  personal_email,
  updated_at
) on public.profiles to authenticated;

grant select on public.profile_field_shares to authenticated;
grant update (shareable, updated_at) on public.profile_field_shares to authenticated;

grant select, insert on public.connect_tokens to authenticated;
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

revoke all on function public.project_shared_profile(uuid) from public;
revoke all on function public.shareable_fields(uuid) from public;
revoke all on function public.display_name_for(uuid, uuid) from public;

grant execute on function public.project_shared_profile(uuid) to authenticated;
grant execute on function public.shareable_fields(uuid) to authenticated;
grant execute on function public.name_for(uuid) to authenticated;
grant execute on function public.exchange_peer_name(uuid) to authenticated;
grant execute on function public.mint_connect_token(integer) to authenticated;
grant execute on function public.open_exchange(text, public.exchange_method) to authenticated;
grant execute on function public.confirm_exchange(uuid) to authenticated;
grant execute on function public.decline_exchange(uuid) to authenticated;
grant execute on function public.set_reminder(uuid, integer, integer) to authenticated;
grant execute on function public.complete_follow_up(uuid) to authenticated;
grant execute on function public.request_one_on_one(uuid) to authenticated;
grant execute on function public.respond_one_on_one(uuid, boolean) to authenticated;
grant execute on function public.schedule_one_on_one(uuid, timestamptz) to authenticated;

grant select on public.contact_cards to authenticated;
grant select on public.undone_follow_ups to authenticated;
grant select on public.visible_one_on_ones to authenticated;
