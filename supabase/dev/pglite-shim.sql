-- Stands in for the parts of Supabase that PGlite does not have.
--
-- Used by the database tests (supabase/tests/harness.ts) and by the web app's
-- dev server (apps/web/lib/db.ts), so there is one copy of the shim rather
-- than two that drift.
--
-- Everything downstream of these three things is the real shipped SQL.

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Supabase reads this from the request's JWT. Here it reads a session
-- variable, which the caller sets before running anything as that user.
create or replace function auth.uid() returns uuid
language sql stable as $shim$
  select nullif(current_setting('guy.test_uid', true), '')::uuid;
$shim$;

create role authenticated nologin;
grant usage on schema auth to authenticated;

-- pg_cron cannot load in WASM. This records what would have been scheduled so
-- a test can assert the jobs registered, and runs nothing. The job functions
-- themselves are real and are called directly.
create schema if not exists cron;

create table if not exists cron.job (
  jobid    bigserial primary key,
  jobname  text,
  schedule text,
  command  text
);

create or replace function cron.schedule(p_name text, p_schedule text, p_command text)
returns bigint language sql as $shim$
  insert into cron.job (jobname, schedule, command)
  values (p_name, p_schedule, p_command)
  returning jobid;
$shim$;
