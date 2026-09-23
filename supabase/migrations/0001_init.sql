-- Guy v1 — initial schema.
--
-- Trust model, in one paragraph:
--   `profiles` is readable ONLY by the person it describes. No other user, at
--   any time, holds a SELECT grant on someone else's profile row. The only way
--   one user ever sees another user's data is public.project_shared_profile(uuid), a
--   SECURITY DEFINER function that returns just the fields that person is
--   currently sharing. That makes the database the enforcement point
--   for consent: a bug in a client cannot widen what that client may see.
--
-- See docs/03-decisions.md for the reasoning behind non-obvious choices, and
-- docs/01-open-questions.md for the spec gaps still outstanding.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- The fixed, closed set of profile fields. Adding a field is a migration on
-- purpose: every field here can cross a privacy boundary, so new ones should
-- be deliberate and reviewed rather than ad hoc.
create type public.profile_field as enum (
  -- basic info. first_name and last_name are the only REQUIRED profile fields;
  -- everything else is optional. Required means "must be filled in", not "must
  -- be shared": both still carry a shareable toggle like any other field.
  'first_name',
  'last_name',
  'school',
  'societies',
  'major',
  'class_year',
  'affiliations',
  'hometown',
  -- "talk to me about"
  'currently_into',
  'want_to_learn',
  'figuring_out',
  -- handles
  'linkedin',
  'x',
  'discord',
  'instagram',
  'phone',
  'work_email',
  'personal_email'
);

create type public.exchange_method as enum ('uwb', 'qr');

create type public.exchange_state as enum (
  'pending',    -- waiting on one or both confirmations
  'completed',  -- both confirmed in time; connection rows exist
  'declined',   -- someone explicitly said no
  'expired'     -- the 30s window closed with a confirmation missing
);

-- NOTE: 'declined' is not in the status list in the brief, but the brief also
-- says decline is a flow. See Q4: a declined request disappears from both
-- lists and, unlike approval, sends no notification.
create type public.one_on_one_status as enum (
  'pending',
  'approved',
  'scheduled',
  'declined',
  'expired'
);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  username      citext not null unique,

  -- basic info. Only the two name fields are required.
  first_name    text not null,
  last_name     text not null,
  school        text,
  societies     text,
  major         text,
  class_year    text,   -- text, not int: "2027", "Grad '26", "5th year" all occur
  affiliations  text,
  hometown      text,

  -- "talk to me about" (all optional, no character limit)
  currently_into text,
  want_to_learn  text,
  figuring_out   text,

  -- handles (all optional). Stored bare, without URL or @ prefix; the profile
  -- URL is constructed at render time. See packages/shared/src/handles.ts.
  linkedin       text,
  x              text,
  discord        text,
  instagram      text,
  phone          text,
  work_email     text,
  personal_email text,

  -- Discord's numeric user id. A username alone cannot be turned into a
  -- profile link; the id can (https://discord.com/users/{id}), which is why it
  -- is collected at all. It is NOT a separate shareable field: it rides along
  -- with `discord`, because sharing a username while withholding the id that
  -- makes it tappable would be a setting with no sensible meaning.
  discord_id     text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The only required profile content in v1.
  constraint profiles_first_name_present check (btrim(first_name) <> ''),
  constraint profiles_last_name_present  check (btrim(last_name)  <> ''),
  -- Discord ids are snowflakes: 17 to 20 digits in practice.
  constraint profiles_discord_id_numeric
    check (discord_id is null or discord_id ~ '^[0-9]{15,25}$')
);

comment on table public.profiles is
  'One row per user. Readable only by its owner. Other users reach a subset of these columns exclusively through public.project_shared_profile().';

-- ---------------------------------------------------------------------------
-- Standing "shareable" toggles
-- ---------------------------------------------------------------------------

-- One row per (user, field). Rows are seeded for every field at profile
-- creation so consent is always explicit and auditable, never inferred from an
-- absent row.
create table public.profile_field_shares (
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  field      public.profile_field not null,
  shareable  boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, field)
);

create index profile_field_shares_user_idx
  on public.profile_field_shares (user_id) where shareable;

-- Seed every field as shareable when a profile is created. The spec says the
-- toggle "defaults to on for every field".
create or replace function public.seed_profile_field_shares()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profile_field_shares (user_id, field)
  select new.user_id, f
  from unnest(enum_range(null::public.profile_field)) as f
  on conflict (user_id, field) do nothing;
  return new;
end;
$fn$;

create trigger profiles_seed_shares
  after insert on public.profiles
  for each row execute function public.seed_profile_field_shares();

-- ---------------------------------------------------------------------------
-- QR tokens
-- ---------------------------------------------------------------------------

-- A QR code never encodes a bare user id. It encodes a random, single-use,
-- short-lived token. A screenshotted code is worthless once it expires or is
-- consumed, and consuming it only *opens* an exchange, never completes one.
create table public.qr_tokens (
  token       text primary key,
  user_id     uuid not null references public.profiles(user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references public.profiles(user_id) on delete set null
);

create index qr_tokens_user_idx on public.qr_tokens (user_id, expires_at desc);

-- ---------------------------------------------------------------------------
-- Exchanges (the two-sided handshake)
-- ---------------------------------------------------------------------------

-- An exchange is the pending handshake. It becomes two connection rows only
-- when BOTH sides confirm, within the 30 second window. Until then nothing is
-- shared, and on timeout nothing happens on either side.
create table public.exchanges (
  id           uuid primary key default gen_random_uuid(),
  method       public.exchange_method not null,
  state        public.exchange_state not null default 'pending',

  initiator_id uuid not null references public.profiles(user_id) on delete cascade,
  responder_id uuid not null references public.profiles(user_id) on delete cascade,

  initiator_confirmed_at timestamptz,
  responder_confirmed_at timestamptz,

  created_at timestamptz not null default now(),
  -- 30 second confirmation window, per spec. Set by open_exchange().
  expires_at timestamptz not null,
  settled_at timestamptz,

  constraint exchanges_distinct_parties check (initiator_id <> responder_id)
);

create index exchanges_party_idx on public.exchanges (initiator_id, state);
create index exchanges_responder_idx on public.exchanges (responder_id, state);
create index exchanges_sweep_idx on public.exchanges (expires_at) where state = 'pending';

-- ---------------------------------------------------------------------------
-- Connections (one row per direction)
-- ---------------------------------------------------------------------------

create table public.connections (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(user_id) on delete cascade,
  other_id uuid not null references public.profiles(user_id) on delete cascade,

  exchange_id uuid references public.exchanges(id) on delete set null,
  met_via     public.exchange_method not null,

  -- A record of which fields `other_id` was sharing at the moment of the
  -- exchange. HISTORICAL ONLY: this does not decide what the owner can see.
  --
  -- Visibility follows the other person's CURRENT shareable toggles, so
  -- turning a field off hides it from everyone immediately and turning it on
  -- reveals it to everyone immediately, including people met while it was off.
  -- Nothing reads this column to answer "may I see this field"; see
  -- public.project_shared_profile(). It is kept because it answers a different
  -- and occasionally useful question: what did we show each other that day.
  fields_at_exchange public.profile_field[] not null default '{}',

  -- "How you met": free text with a day-level timestamp.
  how_we_met    text,
  how_we_met_on date,

  -- Follow-up intent.
  want_follow_up  boolean,
  follow_up_topic text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint connections_distinct_parties check (owner_id <> other_id),
  constraint connections_unique_direction unique (owner_id, other_id)
);

create index connections_owner_idx on public.connections (owner_id, created_at desc);
create index connections_other_idx on public.connections (other_id);

comment on column public.connections.fields_at_exchange is
  'Historical record of what the other person was sharing when you met. Does NOT gate visibility: that follows their current shareable toggles.';

-- ---------------------------------------------------------------------------
-- Notes (private to the connection owner, always)
-- ---------------------------------------------------------------------------

create table public.connection_notes (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  body          text not null,
  -- Day-level timestamp, per spec: entries are dated, not clock-stamped.
  noted_on      date not null default current_date,
  highlighted   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index connection_notes_conn_idx
  on public.connection_notes (connection_id, noted_on desc, created_at desc);

comment on table public.connection_notes is
  'Each person''s notes are private. The subject of a note never sees it; RLS scopes every row to the owner of the parent connection.';

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------

create table public.reminders (
  id            uuid primary key default gen_random_uuid(),
  -- One-time and not repeating, one slot per connection ("set or edit a
  -- reminder"), so this is unique rather than a list.
  connection_id uuid not null unique references public.connections(id) on delete cascade,

  -- Duration as the user entered it, kept for display and for editing.
  days  integer not null,
  hours integer not null,

  fire_at  timestamptz not null,
  fired_at timestamptz,
  done_at  timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reminders_days_range  check (days  between 0 and 7),
  constraint reminders_hours_range check (hours between 0 and 23),
  -- Minimum total duration 1 hour (this also enforces "x and y can't both be
  -- zero"), maximum total duration 7 days.
  constraint reminders_min_total check (days * 24 + hours >= 1),
  constraint reminders_max_total check (days * 24 + hours <= 168)
);

create index reminders_due_idx on public.reminders (fire_at) where fired_at is null;

-- ---------------------------------------------------------------------------
-- 1:1 requests
-- ---------------------------------------------------------------------------

create table public.one_on_one_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles(user_id) on delete cascade,
  recipient_id  uuid not null references public.profiles(user_id) on delete cascade,
  -- The requester's own connection row for the recipient.
  connection_id uuid not null references public.connections(id) on delete cascade,

  status public.one_on_one_status not null default 'pending',

  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  declined_at timestamptz,

  -- Both windows start counting from approval, per spec.
  --   expires_at     = approved_at + 3 days   (deadline to agree on a time)
  --   outer_limit_at = approved_at + 14 days  (latest the meeting itself may be)
  expires_at     timestamptz,
  outer_limit_at timestamptz,

  scheduled_for timestamptz,
  scheduled_at  timestamptz,

  constraint one_on_one_distinct_parties check (requester_id <> recipient_id)
);

create index one_on_one_requester_idx on public.one_on_one_requests (requester_id, status);
create index one_on_one_recipient_idx on public.one_on_one_requests (recipient_id, status);
create index one_on_one_sweep_idx on public.one_on_one_requests (expires_at)
  where status = 'approved';

-- Only one live request may exist between a given pair at a time; once it
-- expires or is declined, "either person can send a new one".
create unique index one_on_one_one_live_per_pair
  on public.one_on_one_requests (
    least(requester_id, recipient_id),
    greatest(requester_id, recipient_id)
  )
  where status in ('pending', 'approved', 'scheduled');

-- The in-chat scheduling window. Realtime-subscribed by both clients.
create table public.one_on_one_messages (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.one_on_one_requests(id) on delete cascade,
  sender_id  uuid not null references public.profiles(user_id) on delete cascade,
  body       text,
  -- A message may carry a concrete proposed time, which the other side accepts
  -- to move the request to 'scheduled'.
  proposed_for timestamptz,
  created_at   timestamptz not null default now(),

  constraint one_on_one_messages_nonempty
    check (body is not null or proposed_for is not null)
);

create index one_on_one_messages_request_idx
  on public.one_on_one_messages (request_id, created_at);

-- ---------------------------------------------------------------------------
-- Push tokens
-- ---------------------------------------------------------------------------

create table public.push_tokens (
  token        text primary key,
  user_id      uuid not null references public.profiles(user_id) on delete cascade,
  platform     text not null check (platform in ('ios', 'android', 'web')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

-- Outbound push queue. Rows are drained by the scheduled job; keeping them in
-- the database means a delivery attempt is never lost if the worker restarts.
create table public.push_outbox (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer not null default 0,
  last_error text
);

create index push_outbox_unsent_idx on public.push_outbox (created_at)
  where sent_at is null;
