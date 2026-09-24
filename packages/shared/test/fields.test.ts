import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROFILE_FIELDS,
  FIELD_KEYS,
  GROUP_ORDER,
  fieldsInGroup,
  labelFor,
  isRequired,
  fullName,
  REQUIRED_FIELDS,
  TALK_PLACEHOLDERS,
} from '../src/fields.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const migrationsDir = join(repoRoot, 'supabase', 'migrations');

/**
 * The profile_field enum as the database would end up holding it.
 *
 * Reading only the `create type` in 0001 would have stopped being the truth
 * the first time a field was added in a later migration, and the guard below
 * would have gone on passing while describing a schema that no longer exists.
 * So this replays every migration in order: the create, then each
 * `alter type ... add value`, honouring `before` and `after`, because enum
 * sort order is what enum_range() and every ordered read follow.
 */
function enumMembers(): string[] {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  let members: string[] | null = null;

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');

    const created = sql.match(/create type public\.profile_field as enum \(([\s\S]*?)\);/);
    if (created) {
      assert.equal(members, null, `profile_field is created twice, in ${file}`);
      members = [...created[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    }

    const added = sql.matchAll(
      /alter type public\.profile_field add value (?:if not exists )?'([a-z_]+)'(?:\s+(before|after)\s+'([a-z_]+)')?/gi,
    );
    for (const [, label, position, anchor] of added) {
      assert.ok(members, `${file} adds to profile_field before it is created`);
      if (members!.includes(label)) continue; // `if not exists`, replayed
      if (!position) {
        members!.push(label);
        continue;
      }
      const at = members!.indexOf(anchor!);
      assert.notEqual(at, -1, `${file} places '${label}' ${position} '${anchor}', which does not exist`);
      members!.splice(position.toLowerCase() === 'after' ? at + 1 : at, 0, label);
    }
  }

  assert.ok(members, 'could not find the profile_field enum in any migration');
  return members!;
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

  test('first and last name are the only required fields', () => {
    const required = PROFILE_FIELDS.filter((f) => isRequired(f.key)).map((f) => f.key);
    assert.deepEqual(required, ['first_name', 'last_name']);
  });

  test('a required field is still an ordinary shareable field', () => {
    // Required means "must be filled in", not "must be shared". Nothing in the
    // registry marks these as unshareable, and nothing should.
    for (const key of REQUIRED_FIELDS) {
      assert.ok(FIELD_KEYS.includes(key), `${key} must be a normal profile field`);
    }
  });
});

describe('full name', () => {
  test('joins both parts', () => {
    assert.equal(fullName({ first_name: 'Alice', last_name: 'Alvarez' }), 'Alice Alvarez');
  });

  test('is null when either part was withheld', () => {
    assert.equal(fullName({ first_name: 'Alice' }), null);
    assert.equal(fullName({ last_name: 'Alvarez' }), null);
    assert.equal(fullName({}), null);
  });

  test('is null when either part came back as the empty marker', () => {
    // "-" means the field is shared but blank. Rendering "Alice -" as someone's
    // name would be worse than falling back to their username.
    assert.equal(fullName({ first_name: 'Alice', last_name: '-' }), null);
    assert.equal(fullName({ first_name: '-', last_name: 'Alvarez' }), null);
  });

});
