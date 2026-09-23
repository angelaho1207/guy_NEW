-- Guy v1 — scheduled jobs.
--
-- The brief flags this as missing from the original stack list: reminders and
-- the 1:1 windows have to fire and expire at a wall-clock time even when
-- nobody has the app open. Without this file, reminders never arrive and
-- approved requests never expire.
--
-- Implemented with pg_cron inside Postgres rather than a Vercel Cron Job. See
-- docs/03-decisions.md, D4, for why.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------

-- Queues the push and marks the reminder fired. It stays in the in-app undone
-- follow-ups list until the user marks it done, which is a separate action.
create or replace function public.fire_due_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer := 0;
begin
  with due as (
    select r.id, c.owner_id, c.other_id, c.id as connection_id
    from public.reminders r
    join public.connections c on c.id = r.connection_id
    where r.fired_at is null
      and r.fire_at <= now()
    for update of r skip locked
  ),
  queued as (
    insert into public.push_outbox (user_id, title, body, data)
    select
      d.owner_id,
      'To do',
      format('Follow up with %s.', public.display_name_for(d.other_id, d.owner_id)),
      jsonb_build_object(
        'kind', 'reminder',
        'connection_id', d.connection_id,
        'reminder_id', d.id
      )
    from due d
    returning 1
  ),
  marked as (
    update public.reminders r
       set fired_at = now()
      from due d
     where r.id = d.id
    returning 1
  )
  select count(*) into v_count from marked;

  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 1:1 request expiry
-- ---------------------------------------------------------------------------

-- "If the two people haven't agreed on a time within 3 days of approval, the
-- request expires and either person can send a new one."
create or replace function public.expire_stale_one_on_ones()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer := 0;
begin
  with stale as (
    update public.one_on_one_requests
       set status = 'expired'
     where status = 'approved'
       and expires_at is not null
       and expires_at <= now()
    returning id, requester_id, recipient_id
  ),
  queued as (
    insert into public.push_outbox (user_id, title, body, data)
    select
      party,
      'Guy',
      'Your 1:1 request expired before a time was agreed. You can send a new one.',
      jsonb_build_object('kind', 'one_on_one_expired', 'request_id', s.id)
    from stale s
    cross join lateral unnest(array[s.requester_id, s.recipient_id]) as party
    returning 1
  )
  select count(*) into v_count from stale;

  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Handshake and token hygiene
-- ---------------------------------------------------------------------------

-- confirm_exchange() already refuses a late confirmation, so this sweep is not
-- what enforces the 30 second rule. It settles the row so both clients'
-- realtime subscriptions see the cancellation, and keeps the table tidy.
create or replace function public.expire_stale_exchanges()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  with stale as (
    update public.exchanges
       set state = 'expired', settled_at = now()
     where state = 'pending'
       and expires_at <= now()
    returning 1
  )
  select count(*) into v_count from stale;

  return coalesce(v_count, 0);
end;
$fn$;

create or replace function public.purge_spent_qr_tokens()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  with gone as (
    delete from public.qr_tokens
     where expires_at < now() - interval '1 day'
    returning 1
  )
  select count(*) into v_count from gone;

  return coalesce(v_count, 0);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------

-- Reminder resolution is hours, so a minute-granularity tick is ample.
select cron.schedule(
  'guy-fire-due-reminders',
  '* * * * *',
  $cron$ select public.fire_due_reminders(); $cron$
);

select cron.schedule(
  'guy-expire-one-on-ones',
  '* * * * *',
  $cron$ select public.expire_stale_one_on_ones(); $cron$
);

-- The handshake window is 30 seconds, so this one runs on the same tick and
-- clients rely on their own local timer for the in-the-moment countdown.
select cron.schedule(
  'guy-expire-exchanges',
  '* * * * *',
  $cron$ select public.expire_stale_exchanges(); $cron$
);

select cron.schedule(
  'guy-purge-qr-tokens',
  '17 4 * * *',
  $cron$ select public.purge_spent_qr_tokens(); $cron$
);
