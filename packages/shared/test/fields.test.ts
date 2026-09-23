import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROFILE_FIELDS,
  FIELD_KEYS,
  GROUP_ORDER,
  fieldsInGroup,
  labelFor,
  TALK_PLACEHOLDERS,
} from '../src/fields.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const initSql = readFileSync(
  join(repoRoot, 'supabase', 'migrations', '0001_init.sql'),
  'utf8',
);

/** Pulls the labels out of `create type public.profile_field as enum (...)`. */
function enumMembers(): string[] {
  const match = initSql.match(
    /create type public\.profile_field as enum \(([\s\S]*?)\);/,
  );
  assert.ok(match, 'could not find the profile_field enum in the migration');
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('the field registry', () => {
  // This is the guard that matters. The database decides what may be shared;
  // this registry decides what the UI shows. If they disagree, a field either
  // becomes unshareable or becomes invisible, and neither failure is loud.
  test('matches the profile_field enum exactly, in the same order', () => {
    assert.deepEqual([...FIELD_KEYS], enumMembers());
  });

  test('every field has a non-empty label', () => {
    for (const f of PROFILE_FIELDS) {
      assert.ok(f.label.trim().length > 0, `${f.key} needs a label`);
    }
  });

  test('every field belongs to a known group', () => {
    for (const f of PROFILE_FIELDS) {
      assert.ok(
        (GROUP_ORDER as readonly string[]).includes(f.group),
        `${f.key} has group ${f.group}, which is not in GROUP_ORDER`,
      );
    }
  });

  test('the groups partition the field list', () => {
    const counted = GROUP_ORDER.reduce((n, g) => n + fieldsInGroup(g).length, 0);
    assert.equal(counted, PROFILE_FIELDS.length);
  });

  test('field keys are unique', () => {
    assert.equal(new Set(FIELD_KEYS).size, FIELD_KEYS.length);
  });

  test('labelFor resolves a known key', () => {
    assert.equal(labelFor('class_year'), 'Class year');
  });

  test('each "talk to me about" box has placeholder copy', () => {
    for (const key of ['currently_into', 'want_to_learn', 'figuring_out'] as const) {
      assert.ok(
        TALK_PLACEHOLDERS[key].length > 0,
        `${key} needs stand-in placeholder copy until the real copy arrives`,
      );
    }
  });
});
