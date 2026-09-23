// Boots a real Postgres (PGlite, WASM) in-process, applies the migrations in
// supabase/migrations, and gives the tests a way to act *as a specific user*
// with RLS actually enforced.
//
// Why this exists: the consent rules in Guy are enforced by row level security
// and by SECURITY DEFINER functions. Testing them against mocks would test
// nothing. These tests execute the same SQL that ships.
//
// Two things are shimmed, because neither exists outside Supabase:
//   * `auth.users` and `auth.uid()`. The shim reads a session GUC instead of a
//     JWT claim; everything downstream of auth.uid() is the real code.
//   * `cron.schedule()`. pg_cron cannot run in WASM, so scheduling is a no-op.
//     The job *functions* themselves are real and are invoked directly.

import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

// Supabase provides these; PGlite does not.
const AUTH_SHIM = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id                 uuid primary key default gen_random_uuid(),
    email              text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at         timestamptz not null default now()
  );

  -- Stands in for Supabase's JWT-backed auth.uid().
  create or replace function auth.uid() returns uuid
  language sql stable as $shim$
    select nullif(current_setting('guy.test_uid', true), '')::uuid;
  $shim$;

  create role authenticated nologin;
  grant usage on schema auth to authenticated;

  -- pg_cron stand-in. Records the schedule so a test can assert the jobs were
  -- registered, without actually running anything.
  create schema if not exists cron;
  create table if not exists cron.job (
    jobid   bigserial primary key,
    jobname text,
    schedule text,
    command text
  );
  create or replace function cron.schedule(p_name text, p_schedule text, p_command text)
  returns bigint language sql as $shim$
    insert into cron.job (jobname, schedule, command)
    values (p_name, p_schedule, p_command)
    returning jobid;
  $shim$;
`;

export type Db = {
  /** Run SQL as the database superuser, bypassing RLS. Setup only. */
  admin(sql: string, params?: unknown[]): Promise<any>;
  /** Run SQL as `authenticated`, with auth.uid() bound to `uid`. RLS applies. */
  as(uid: string, sql: string, params?: unknown[]): Promise<any>;
  /** Like `as`, but resolves to the error message instead of throwing. */
  asExpectingFailure(uid: string, sql: string, params?: unknown[]): Promise<string>;
  /**
   * Create an auth user + profile, returning the new user id.
   * First and last name are required profile content, so they are supplied
   * here; the defaults keep tests that do not care about names readable.
   */
  createUser(username: string, firstName?: string, lastName?: string): Promise<string>;
  close(): Promise<void>;
};

export async function boot(): Promise<Db> {
  const pg = await PGlite.create({ extensions: { citext, pgcrypto } });

  await pg.exec(AUTH_SHIM);

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    let sql = readFileSync(join(migrationsDir, file), 'utf8');
    // pg_cron is not loadable in WASM; cron.schedule() is shimmed above.
    sql = sql.replace(/create extension if not exists pg_cron;/g, '');
    try {
      await pg.exec(sql);
    } catch (err: any) {
      throw new Error(`migration ${file} failed: ${err.message}`);
    }
  }

  const reset = async () => {
    await pg.exec(`reset role; select set_config('guy.test_uid', '', false);`);
  };

  const admin = async (sql: string, params?: unknown[]) => {
    await reset();
    return params ? pg.query(sql, params) : pg.exec(sql);
  };

  const as = async (uid: string, sql: string, params?: unknown[]) => {
    await reset();
    await pg.query(`select set_config('guy.test_uid', $1, false)`, [uid]);
    await pg.exec(`set role authenticated`);
    try {
      return params ? await pg.query(sql, params) : await pg.exec(sql);
    } finally {
      await pg.exec(`reset role`);
    }
  };

  const asExpectingFailure = async (uid: string, sql: string, params?: unknown[]) => {
    try {
      await as(uid, sql, params);
    } catch (err: any) {
      return String(err.message ?? err);
    }
    throw new Error('expected the statement to be rejected, but it succeeded');
  };

  const createUser = async (username: string, firstName?: string, lastName?: string) => {
    await reset();
    const first = firstName ?? username[0].toUpperCase() + username.slice(1);
    const last = lastName ?? 'Test';
    const res = await pg.query<{ id: string }>(
      `insert into auth.users (raw_user_meta_data)
       values (jsonb_build_object(
         'username', $1::text,
         'first_name', $2::text,
         'last_name', $3::text
       ))
       returning id`,
      [username, first, last],
    );
    return res.rows[0].id;
  };

  return {
    admin,
    as,
    asExpectingFailure,
    createUser,
    close: () => pg.close(),
  };
}

/** Convenience: first row of a query result. */
export function row<T = any>(res: any): T {
  const rows = Array.isArray(res) ? res[res.length - 1]?.rows : res.rows;
  return rows?.[0];
}

/** Convenience: all rows of a query result. */
export function rows<T = any>(res: any): T[] {
  return (Array.isArray(res) ? res[res.length - 1]?.rows : res.rows) ?? [];
}
