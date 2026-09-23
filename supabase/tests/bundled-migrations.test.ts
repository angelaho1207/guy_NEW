// The web app cannot read the migrations from disk.
//
// A deployed serverless bundle contains the files the build traced through
// imports. `supabase/` sits outside the app and used to be reached with fs,
// which worked locally and produced a bundle that could not boot. So
// apps/web/lib/db.ts imports each migration as a string instead.
//
// That trades one failure for another: the list is now written by hand, and a
// migration left out of it means the web app quietly runs an old schema. This
// is the guard against that.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const migrationsDir = join(repoRoot, 'supabase', 'migrations');
const dbSource = readFileSync(
  join(repoRoot, 'apps', 'web', 'lib', 'db.ts'),
  'utf8',
);

const onDisk = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

describe('the web app bundles every migration', () => {
  test('there is at least one migration to check', () => {
    assert.ok(onDisk.length > 0);
  });

  for (const file of onDisk) {
    test(`${file} is imported by apps/web/lib/db.ts`, () => {
      assert.ok(
        dbSource.includes(`migrations/${file}'`),
        `apps/web/lib/db.ts does not import ${file}. Add the import and add it to MIGRATIONS, or the deployed app will run without it.`,
      );
    });

    test(`${file} is listed in MIGRATIONS, in order`, () => {
      const list = dbSource.slice(
        dbSource.indexOf('const MIGRATIONS'),
        dbSource.indexOf('];', dbSource.indexOf('const MIGRATIONS')),
      );
      assert.ok(
        list.includes(`'${file}'`),
        `${file} is imported but never applied. Add it to MIGRATIONS.`,
      );
    });
  }

  test('MIGRATIONS applies them in filename order', () => {
    const list = dbSource.slice(
      dbSource.indexOf('const MIGRATIONS'),
      dbSource.indexOf('];', dbSource.indexOf('const MIGRATIONS')),
    );
    const applied = [...list.matchAll(/'([0-9]{4}_[a-z_]+\.sql)'/g)].map((m) => m[1]);
    assert.deepEqual(
      applied,
      onDisk,
      'the bundled order must match the on-disk order, or the schema is built wrong',
    );
  });

  test('the shim is bundled too', () => {
    assert.ok(dbSource.includes('dev/pglite-shim.sql'));
  });

  test('nothing reads the migrations from disk any more', () => {
    assert.ok(
      !/readdirSync|readFileSync/.test(dbSource),
      'reading migrations with fs works locally and produces a bundle that cannot boot',
    );
  });
});
