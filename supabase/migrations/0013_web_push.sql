-- Draining push_outbox.
--
-- `fire_due_reminders()` has been writing to that table every minute since
-- 0003, and nothing has ever read it. So follow-up reminders and 1:1 requests
-- have been correct, queued, and silent. This is the other end.
--
-- ---------------------------------------------------------------------------
-- Why the database calls out, rather than something calling in
-- ---------------------------------------------------------------------------
--
-- The obvious design is a scheduled job on the hosting side that polls. It does
-- not work here: Vercel's Hobby plan caps cron at once per day, and a `*/1`
-- schedule is refused at deploy time. A reminder that arrives up to 24 hours
-- late is not a reminder.
--
-- pg_cron already runs in this database every minute and costs nothing. So the
-- database pokes the worker instead, through pg_net, and only when there is
-- something to send -- an idle minute makes no request at all.
--
-- ---------------------------------------------------------------------------
-- What the worker is trusted with, and how little that is
-- ---------------------------------------------------------------------------
--
-- The worker reads other people's notification text, so it is not something a
-- signed-in client may do. None of the functions below are granted to `anon` or
-- `authenticated` at all. They are reachable only as the database owner, which
-- is the connection the server holds and no browser ever has.
--
-- The two functions a person DOES call are the two about their own device:
-- registering a subscription and forgetting it. Both take `auth.uid()` from the
-- session rather than an argument, so neither can be aimed at somebody else.

-- ---------------------------------------------------------------------------
-- A web push subscription is three values, not one
-- ---------------------------------------------------------------------------

-- `push_tokens` was shaped for a native token: one opaque string. A browser
-- subscription is an endpoint URL plus two keys, and all three are needed to
-- encrypt a message that only that browser can open. The endpoint stays in
-- `token`, since it is the unique part.
alter table public.push_tokens add column if not exists p256dh text;
alter table public.push_tokens add column if not exists auth   text;

-- A web row without its keys is undeliverable, and would sit in the outbox
-- failing forever. Native rows have no keys by design, hence the branch.
alter table public.push_tokens drop constraint if exists push_tokens_web_has_keys;
alter table public.push_tokens add constraint push_tokens_web_has_keys check (
  platform <> 'web'
  or (p256dh is not null and btrim(p256dh) <> '' and auth is not null and btrim(auth) <> '')
);

comment on column public.push_tokens.p256dh is
  'Web push only: the subscription public key. Null for native tokens.';
comment on column public.push_tokens.auth is
  'Web push only: the subscription auth secret. Null for native tokens.';

-- ---------------------------------------------------------------------------
-- Turning notifications on, and off
-- ---------------------------------------------------------------------------

-- Saves this browser's subscription.
--
-- Upserts on the endpoint, because a browser hands back the same endpoint when
-- a permission is re-granted and a new row each time would mean sending the
-- same notification twice to one device.
create or replace function public.register_push_token(
  p_token    text,
  p_platform text,
  p_p256dh   text default null,
  p_auth     text default null
)
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

  if p_platform not in ('ios', 'android', 'web') then
    raise exception 'unknown platform';
  end if;

  if nullif(btrim(coalesce(p_token, '')), '') is null then
    raise exception 'a subscription needs an endpoint';
  end if;

  insert into public.push_tokens (token, user_id, platform, p256dh, auth)
  values (btrim(p_token), v_uid, p_platform, nullif(btrim(p_p256dh), ''), nullif(btrim(p_auth), ''))
  on conflict (token) do update
     set user_id = excluded.user_id,
         platform = excluded.platform,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         last_seen_at = now();
end;
$fn$;

-- Turning them off. Scoped to the caller: passing somebody else's endpoint
-- deletes nothing.
create or replace function public.forget_push_token(p_token text)
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

  delete from public.push_tokens
   where token = btrim(p_token)
     and user_id = v_uid;
end;
$fn$;

revoke all on function public.register_push_token(text, text, text, text) from public;
revoke all on function public.forget_push_token(text) from public;
grant execute on function public.register_push_token(text, text, text, text) to authenticated;
grant execute on function public.forget_push_token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Where the worker lives
-- ---------------------------------------------------------------------------

-- One row, inserted by hand after deploying. Not in a migration, because the
-- URL differs per environment and the secret should not be in git.
--
-- RLS on, no policies, no grants: unreadable by `anon` and `authenticated`
-- alike. Only the owner and SECURITY DEFINER functions can see it, which is the
-- same protection the outbox itself has.
create table if not exists public.worker_config (
  id     boolean primary key default true,
  url    text not null,
  secret text not null,
  constraint worker_config_single_row check (id)
);

alter table public.worker_config enable row level security;

comment on table public.worker_config is
  'Where to poke the push worker, and the shared secret it checks. One row. Readable by nobody.';

-- ---------------------------------------------------------------------------
-- Draining
-- ---------------------------------------------------------------------------

-- How many times a message is retried before it is left alone. Five minutes of
-- trying, at a minute apart, is enough for a blip and short enough that a
-- genuinely dead subscription stops costing anything.
create or replace function public.push_max_attempts()
returns integer language sql immutable as $fn$ select 5 $fn$;

-- Takes the next batch and counts the attempt in the same statement.
--
-- `attempts` is incremented on the way OUT rather than after a failure, so a
-- worker that crashes mid-send cannot leave a message to be retried forever.
-- The cost is that a crash can lose one delivery, which for a reminder is the
-- better trade.
--
-- `skip locked` so two overlapping workers never pick up the same row.
create or replace function public.claim_push_batch(p_limit integer default 50)
returns table (
  outbox_id uuid,
  title     text,
  body      text,
  data      jsonb,
  endpoint  text,
  p256dh    text,
  auth      text
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return query
  with due as (
    select o.id
      from public.push_outbox o
     where o.sent_at is null
       and o.attempts < public.push_max_attempts()
     order by o.created_at
     limit greatest(1, least(coalesce(p_limit, 50), 200))
     for update skip locked
  ),
  counted as (
    update public.push_outbox o
       set attempts = o.attempts + 1
      from due
     where o.id = due.id
    returning o.id, o.user_id, o.title, o.body, o.data
  )
  select c.id, c.title, c.body, c.data, t.token, t.p256dh, t.auth
    from counted c
    join public.push_tokens t
      on t.user_id = c.user_id
     and t.platform = 'web'
   order by c.id;
end;
$fn$;

-- Marks delivery. Called once per batch rather than once per message.
create or replace function public.mark_push_sent(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  with done as (
    update public.push_outbox
       set sent_at = now(), last_error = null
     where id = any(p_ids)
       and sent_at is null
    returning 1
  )
  select count(*) into v_count from done;

  return coalesce(v_count, 0);
end;
$fn$;

-- Records why something did not go. The attempt was already counted when the
-- batch was claimed, so this only keeps the reason.
create or replace function public.mark_push_failed(p_ids uuid[], p_error text)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  with done as (
    update public.push_outbox
       set last_error = left(coalesce(p_error, 'unknown'), 500)
     where id = any(p_ids)
       and sent_at is null
    returning 1
  )
  select count(*) into v_count from done;

  return coalesce(v_count, 0);
end;
$fn$;

-- A subscription the push service has rejected as gone.
--
-- Browsers expire these routinely -- a reinstall, a cleared site, a long
-- absence -- and the push service answers 404 or 410. Keeping a dead
-- subscription means every future notification for that person fails, so the
-- worker tells us and we drop it. Unlike `forget_push_token` this is not scoped
-- to a caller, which is exactly why it is granted to nobody.
create or replace function public.drop_push_subscription(p_endpoint text)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  with gone as (
    delete from public.push_tokens where token = p_endpoint returning 1
  )
  select count(*) into v_count from gone;

  return coalesce(v_count, 0);
end;
$fn$;

revoke all on function public.push_max_attempts() from public;
revoke all on function public.claim_push_batch(integer) from public;
revoke all on function public.mark_push_sent(uuid[]) from public;
revoke all on function public.mark_push_failed(uuid[], text) from public;
revoke all on function public.drop_push_subscription(text) from public;

-- ---------------------------------------------------------------------------
-- The poke
-- ---------------------------------------------------------------------------

-- Asks the worker to come and drain, if there is anything to drain.
--
-- The guard matters more than it looks: without it this fires 1,440 requests a
-- day whether or not a single reminder exists, which on a free tier is both
-- rude and pointless. With it, an idle app makes no requests at all.
--
-- Nothing is awaited. pg_net queues the request and returns, so a slow or dead
-- worker cannot hold up the cron job or the transaction.
create or replace function public.notify_push_worker()
returns void
language plpgsql
security definer
set search_path = public, extensions, net
as $fn$
declare
  v_cfg public.worker_config%rowtype;
begin
  if not exists (
    select 1 from public.push_outbox
     where sent_at is null and attempts < public.push_max_attempts()
  ) then
    return;
  end if;

  select * into v_cfg from public.worker_config where id;

  -- Not configured yet. Silent rather than noisy: the row is inserted by hand
  -- after a deploy, and a migration that ran before that is not an error.
  if v_cfg.url is null then
    return;
  end if;

  perform net.http_post(
    url := v_cfg.url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Worker-Secret', v_cfg.secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$fn$;

revoke all on function public.notify_push_worker() from public;

select cron.schedule(
  'guy-notify-push-worker',
  '* * * * *',
  $cron$ select public.notify_push_worker(); $cron$
);
