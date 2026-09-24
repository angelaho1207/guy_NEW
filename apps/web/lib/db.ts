import 'server-only';

import { Pool } from 'pg';

/**
 * Two backends, one interface.
 *
 * **Supabase**, when `SUPABASE_DB_URL` is set. Real Postgres, real accounts,
 * one database that two phones can both reach. This is the app.
 *
 * **The demo database**, when it is not. See `./pglite`. No account, no keys,
 * no setup: clone and `npm run dev`.
 *
 * The same migrations apply to both and the same SQL runs against both, so the
 * demo is not a mock of the app. It is the app with a throwaway database.
 *
 * ## Why raw SQL rather than the Supabase client
 *
 * `supabase-js` speaks PostgREST and RPC, not SQL, so using it here would have
 * meant rewriting every query in the app. Connecting to Postgres directly
 * keeps every query that is already written and already tested.
 *
 * Losing the mobile story was the argument against this, and it turns out not
 * to apply. The functions in `0002` and `0005` are granted to `authenticated`
 * and are already reachable over PostgREST, so a phone can call
 * `open_exchange` or `nearby_people` directly with `supabase-js` and no server
 * code in between. What lives in this file is only how the web pages read.
 *
 * ## How row level security still applies
 *
 * Every query runs inside a transaction that first becomes the `authenticated`
 * role and sets the request's JWT claims. That is what PostgREST itself does,
 * which is why `auth.uid()` returns the right person and the policies behave
 * exactly as they do in the tests. `set local` scopes both to the transaction,
 * so a pooled connection handed to the next request carries nothing over.
 */

const CONNECTION_STRING = process.env.SUPABASE_DB_URL;

export const usingSupabase = Boolean(CONNECTION_STRING);

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

function pool(): Pool {
  const g = globalThis as { __guyPool?: Pool };
  if (!g.__guyPool) {
    g.__guyPool = new Pool({
      connectionString: CONNECTION_STRING,
      ssl: { rejectUnauthorized: false },
      // One connection per instance, not four.
      //
      // A serverless function handles a single request at a time, so a bigger
      // pool buys an instance nothing -- while every instance holding four
      // connections multiplies against however many instances the platform
      // decided to run. The free tier allows 60 in total, and fifteen warm
      // instances is not a lot of traffic. Exhausting it surfaces as an
      // intermittent 500, which is the worst way to learn about it.
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return g.__guyPool;
}

/**
 * Supabase user ids are UUIDs. Checked because the preamble below interpolates
 * the id rather than binding it, and an id that is not a UUID has no business
 * reaching the database anyway.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Single-quoted SQL literal, for the one place a parameter cannot be used. */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function queryPostgres<T>(
  uid: string | null,
  sql: string,
  params: unknown[],
): Promise<T[]> {
  if (uid !== null && !UUID.test(uid)) {
    throw new Error('not a valid user id');
  }

  const role = uid ? 'authenticated' : 'anon';
  const claims = JSON.stringify({ sub: uid, role });

  const client = await pool().connect();
  try {
    // The whole preamble in one round trip rather than three. It used to be
    // three separate awaits, which meant five network hops for every query on
    // a page that issues several, with a pooled connection held open across
    // all of them. `set local` still scopes both to the transaction, so a
    // connection handed to the next request carries nothing over.
    await client.query(
      `begin; set local role ${role}; ` +
        `select set_config('request.jwt.claims', ${literal(claims)}, true);`,
    );

    const res = await client.query(sql, params);
    await client.query('commit');
    return res.rows as T[];
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// The demo database
// ---------------------------------------------------------------------------

type PGliteLike = {
  exec(sql: string): Promise<unknown>;
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

function demo(): Promise<PGliteLike> {
  const g = globalThis as { __guyDb?: Promise<PGliteLike> };
  // Imported lazily so the WebAssembly build is never loaded when a real
  // database is configured, and parked on globalThis so a hot reload does not
  // re-seed on every save.
  if (!g.__guyDb) g.__guyDb = import('./pglite').then((m) => m.boot());
  return g.__guyDb;
}

/**
 * The demo database is one connection and identity is a session variable, so
 * two overlapping requests would otherwise read each other's user. Queries
 * take their turn. The Postgres pool needs none of this, because each query
 * gets its own connection and its own transaction.
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

function queryDemo<T>(
  uid: string | null,
  sql: string,
  params: unknown[],
  asRole: 'authenticated' | 'anon' | 'owner',
): Promise<T[]> {
  return serialize(async () => {
    const pg = await demo();
    await pg.exec(`reset role`);
    await pg.query(`select set_config('guy.test_uid', $1, false)`, [uid ?? '']);
    if (asRole !== 'owner') await pg.exec(`set role ${asRole}`);
    try {
      const res = await pg.query<T>(sql, params);
      return res.rows;
    } finally {
      await pg.exec(`reset role`);
    }
  });
}

// ---------------------------------------------------------------------------
// The interface the app uses
// ---------------------------------------------------------------------------

/** Run a query as `uid`, with row level security enforced. */
export function asUser<T = Record<string, unknown>>(
  uid: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return usingSupabase
    ? queryPostgres<T>(uid, sql, params)
    : queryDemo<T>(uid, sql, params, 'authenticated');
}

/**
 * Run a query with no signed-in user.
 *
 * Against Supabase this is the `anon` role, which since migration 0006 can
 * reach almost nothing. It is not a back door; anything a person is doing goes
 * through `asUser`.
 *
 * Against the demo database it runs as the owner, because the demo has no real
 * accounts and the user switcher has to be able to list them.
 */
export function asAdmin<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return usingSupabase
    ? queryPostgres<T>(null, sql, params)
    : queryDemo<T>(null, sql, params, 'owner');
}

/**
 * Runs a query with no role set, as the connection's own user.
 *
 * This bypasses row level security, so there is exactly one caller: resolving
 * a username to the address Supabase Auth knows it by, during sign-in. That
 * lookup has to happen before anyone is signed in, and `auth.users` is not
 * readable by `anon` or by `authenticated`.
 *
 * Do not reach for this for anything else. Anything a person is doing goes
 * through `asUser`, which is what makes the policies mean something.
 */
export function asOwner<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!usingSupabase) {
    return queryDemo<T>(null, sql, params, 'owner');
  }
  return pool()
    .query(sql, params)
    .then((res) => res.rows as T[]);
}

/**
 * Called once at startup from instrumentation.ts.
 *
 * Booting the demo database is seconds of blocking WebAssembly work, and doing
 * it inside a request means blocking while Next is already streaming a
 * response, which fails for reasons that look nothing like a database problem.
 * With a real database configured there is nothing to warm, so this just
 * proves the connection works and fails loudly at startup if it does not.
 */
export async function warm(): Promise<void> {
  if (usingSupabase) {
    await queryPostgres(null, 'select 1 as ok', []);
    return;
  }
  await demo();
}
