import 'server-only';

import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { seed } from './seed';

/**
 * The dev database.
 *
 * This runs the REAL migrations from supabase/migrations against a real
 * Postgres, compiled to WebAssembly and living inside the dev server. It is
 * not a mock and not a stub: row level security is enforced, the SECURITY
 * DEFINER functions are the shipped ones, and what you see on screen came
 * through the same consent projection that will run in production.
 *
 * The point is that you can look at the app without creating a Supabase
 * project first. The cost is that it is in memory, so every restart is a fresh
 * database with fresh seed data. Nothing you type here survives.
 *
 * Two things are shimmed, both in supabase/dev/pglite-shim.sql: `auth.uid()`
 * reads a session variable instead of a JWT claim, and `cron.schedule()`
 * records rather than runs. See apps/web/README.md for how this is swapped for
 * a real Supabase project.
 */

const repoRoot = join(process.cwd(), '..', '..');
const migrationsDir = join(repoRoot, 'supabase', 'migrations');
const shimPath = join(repoRoot, 'supabase', 'dev', 'pglite-shim.sql');

let bootPromise: Promise<PGlite> | null = null;

async function boot(): Promise<PGlite> {
  const pg = await PGlite.create({ extensions: { citext, pgcrypto } });

  await pg.exec(readFileSync(shimPath, 'utf8'));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
      // pg_cron cannot load in WASM. The job functions are still created and
      // can be called by hand; only the scheduling is inert.
      .replace(/create extension if not exists pg_cron;/g, '');
    try {
      await pg.exec(sql);
    } catch (err) {
      throw new Error(`migration ${file} failed: ${(err as Error).message}`);
    }
  }

  await seed(pg);
  return pg;
}

/**
 * Boot the database up front, from instrumentation.ts.
 *
 * Applying the migrations is seconds of blocking WASM work. Doing it inside a
 * request means blocking while Next is already streaming a response, which
 * fails for reasons that look nothing like a database problem.
 */
export function warm(): Promise<PGlite> {
  return db();
}

function db(): Promise<PGlite> {
  // Next's dev server re-evaluates modules on edit, so the instance is parked
  // on globalThis to survive a hot reload rather than re-seeding every save.
  const g = globalThis as { __guyDb?: Promise<PGlite> };
  if (!g.__guyDb) g.__guyDb = boot();
  bootPromise = g.__guyDb;
  return bootPromise;
}

/**
 * PGlite is a single connection, and acting as a user means setting a session
 * variable before the query. Two overlapping requests would otherwise read
 * each other's identity, so every query takes its turn.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Run a query as `uid`, with row level security enforced. */
export function asUser<T = Record<string, unknown>>(
  uid: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return serialize(async () => {
    const pg = await db();
    await pg.exec(`reset role`);
    await pg.query(`select set_config('guy.test_uid', $1, false)`, [uid]);
    await pg.exec(`set role authenticated`);
    try {
      const res = await pg.query<T>(sql, params);
      return res.rows;
    } finally {
      await pg.exec(`reset role`);
    }
  });
}

/** Run a query with no user, bypassing RLS. Seeding and demo plumbing only. */
export function asAdmin<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return serialize(async () => {
    const pg = await db();
    await pg.exec(`reset role`);
    await pg.query(`select set_config('guy.test_uid', '', false)`);
    const res = await pg.query<T>(sql, params);
    return res.rows;
  });
}

/** First row, or null. */
export async function one<T = Record<string, unknown>>(
  rows: Promise<T[]>,
): Promise<T | null> {
  return (await rows)[0] ?? null;
}
