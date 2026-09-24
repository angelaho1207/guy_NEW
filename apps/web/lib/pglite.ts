import 'server-only';

import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { seed } from './seed';

// Imported, not read from disk. See the note in next.config.mjs: files reached
// only through fs do not travel into a deployed bundle. A test asserts this
// list covers every migration, so adding one and forgetting it here fails
// loudly rather than silently running an old schema.
import shim from '../../../supabase/dev/pglite-shim.sql';
import m0001 from '../../../supabase/migrations/0001_init.sql';
import m0002 from '../../../supabase/migrations/0002_rls_and_functions.sql';
import m0003 from '../../../supabase/migrations/0003_scheduled_jobs.sql';
import m0004 from '../../../supabase/migrations/0004_exchange_method_nearby.sql';
import m0005 from '../../../supabase/migrations/0005_presence.sql';
import m0006 from '../../../supabase/migrations/0006_lock_down_function_execute.sql';
import m0007 from '../../../supabase/migrations/0007_pgcrypto_search_path.sql';
import m0008 from '../../../supabase/migrations/0008_whatsapp_messenger_enum.sql';
import m0009 from '../../../supabase/migrations/0009_whatsapp_messenger.sql';
import m0010 from '../../../supabase/migrations/0010_drop_discord_id.sql';

const MIGRATIONS: [string, string][] = [
  ['0001_init.sql', m0001],
  ['0002_rls_and_functions.sql', m0002],
  ['0003_scheduled_jobs.sql', m0003],
  ['0004_exchange_method_nearby.sql', m0004],
  ['0005_presence.sql', m0005],
  ['0006_lock_down_function_execute.sql', m0006],
  ['0007_pgcrypto_search_path.sql', m0007],
  ['0008_whatsapp_messenger_enum.sql', m0008],
  ['0009_whatsapp_messenger.sql', m0009],
  ['0010_drop_discord_id.sql', m0010],
];

/**
 * The demo database.
 *
 * Postgres compiled to WebAssembly, living inside the dev server, with the
 * real migrations applied and seeded through the real functions. Used only
 * when no `SUPABASE_DB_URL` is configured, so that a fresh clone runs with no
 * account, no keys and no setup.
 *
 * It is in memory, so every restart is a new database and nothing typed into
 * it survives. That is deliberate: a demo that quietly accumulates half-real
 * data is worse than one that resets.
 *
 * Two things are shimmed, both in supabase/dev/pglite-shim.sql and shared with
 * the test harness: `auth.uid()` reads a session variable instead of a JWT
 * claim, and `cron.schedule()` records rather than runs.
 */
export async function boot(): Promise<PGlite> {
  const pg = await PGlite.create({ extensions: { citext, pgcrypto } });

  await pg.exec(shim);

  for (const [name, source] of MIGRATIONS) {
    // pg_cron cannot load in WASM. The job functions are still created and can
    // be called by hand; only the scheduling is inert.
    const sql = source.replace(/create extension if not exists pg_cron;/g, '');
    try {
      await pg.exec(sql);
    } catch (err) {
      throw new Error(`migration ${name} failed: ${(err as Error).message}`);
    }
  }

  await seed(pg);
  return pg;
}
