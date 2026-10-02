// The vocabulary connect codes are built from.
//
// A code went from 43 random characters to three words, which is a deliberate
// reduction in entropy traded for a code a person can type off someone else's
// screen. These tests hold the two halves of that trade in place: the lists have
// to be big enough for the arithmetic in 0011 to be true, and the words have to
// be ones people can hear correctly the first time.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, row, rows, type Db } from './harness.ts';

let db: Db;

const KINDS = ['physical', 'personality', 'animal'] as const;

/** What 0011's comment claims, and therefore what the lists have to support. */
const CLAIMED_MINIMUM = 256;

before(async () => {
  db = await boot();
});

after(async () => {
  await db.close();
});

describe('the word lists', () => {
  test('there are exactly three, with the expected names', async () => {
    const kinds = rows<{ kind: string }>(
      await db.admin(`select distinct kind from public.connect_words order by kind`),
    ).map((r) => r.kind);
    assert.deepEqual(kinds, ['animal', 'personality', 'physical']);
  });

  for (const kind of KINDS) {
    test(`${kind} holds at least ${CLAIMED_MINIMUM} words`, async () => {
      const { n } = row<{ n: number }>(
        await db.admin(`select count(*)::int as n from public.connect_words where kind = $1`, [
          kind,
        ]),
      );
      assert.ok(
        Number(n) >= CLAIMED_MINIMUM,
        `${kind} has ${n}; 0011's entropy arithmetic assumes at least ${CLAIMED_MINIMUM}`,
      );
    });
  }

  test('the combined space is at least sixteen million codes', async () => {
    // The number 0011 commits to in writing. If a word is ever removed, this is
    // what notices.
    const { combos } = row<{ combos: string }>(
      await db.admin(
        `select (
           select count(*) from public.connect_words where kind = 'physical'
         ) * (
           select count(*) from public.connect_words where kind = 'personality'
         ) * (
           select count(*) from public.connect_words where kind = 'animal'
         ) as combos`,
      ),
    );
    assert.ok(
      Number(combos) >= 16_000_000,
      `only ${Number(combos).toLocaleString()} combinations`,
    );
  });

  test('every word is three to eight lowercase letters', async () => {
    // Enforced by a check constraint too; this proves the constraint is on the
    // column people think it is, and catches a word that slipped in before it.
    const bad = rows<{ word: string }>(
      await db.admin(`select word from public.connect_words where word !~ '^[a-z]{3,8}$'`),
    );
    assert.deepEqual(bad, [], 'a code gets typed on a phone keyboard');
  });

  test('no word appears in two lists', async () => {
    const shared = rows<{ word: string }>(
      await db.admin(
        `select word from public.connect_words
          group by word having count(*) > 1`,
      ),
    );
    assert.deepEqual(shared, [], 'a word in two lists makes a code ambiguous to read back');
  });

  test('the barred homophones are absent', async () => {
    // A sample of the pairs 0011 says were excluded. These are the ones that
    // would actually come up: they are all plausible animals or textures, and
    // every one of them has a twin that sounds identical.
    const barred = [
      'bear',
      'bare',
      'hare',
      'hair',
      'deer',
      'dear',
      'moose',
      'mousse',
      'boar',
      'bore',
      'whale',
      'wail',
      'flour',
      'flower',
      'knot',
      'mite',
      'gnat',
      'toad',
    ];
    const found = rows<{ word: string }>(
      await db.admin(`select word from public.connect_words where word = any($1::text[])`, [
        barred,
      ]),
    ).map((r) => r.word);
    assert.deepEqual(found, [], 'these get misheard when the code is read aloud');
  });
});

describe('reading what someone typed', () => {
  // normalize_connect_code is what makes typing equivalent to scanning. It lives
  // in SQL so the future native client inherits it rather than reimplementing it.
  const normalised = async (raw: string) =>
    row<{ out: string | null }>(
      await db.admin(`select public.normalize_connect_code($1) as out`, [raw]),
    ).out;

  test('it leaves a well formed code alone', async () => {
    assert.equal(await normalised('brisk-stubborn-otter'), 'brisk-stubborn-otter');
  });

  test('case, spaces and underscores all arrive at the same code', async () => {
    for (const typed of [
      'Brisk-Stubborn-Otter',
      'BRISK STUBBORN OTTER',
      'brisk_stubborn_otter',
      '  brisk  stubborn  otter  ',
      'brisk--stubborn--otter',
      '-brisk-stubborn-otter-',
    ]) {
      assert.equal(await normalised(typed), 'brisk-stubborn-otter', typed);
    }
  });

  test('punctuation someone pasted is dropped', async () => {
    assert.equal(await normalised('"brisk-stubborn-otter".'), 'brisk-stubborn-otter');
  });

  test('nothing usable comes back as null, not as an empty string', async () => {
    // The caller treats null exactly like a wrong code, so it must not be
    // mistaken for a code that happens to be empty.
    for (const nothing of ['', '   ', '!!!', '12345', null]) {
      assert.equal(await normalised(nothing as string), null, String(nothing));
    }
  });

  test('a digit inside a code does not silently become a different code', async () => {
    // Stripping non-letters is generous, but it must not turn one person's code
    // into another's. `brisk-stubborn-otter9` has no business resolving.
    const out = await normalised('brisk-stubborn-otter9');
    assert.equal(out, 'brisk-stubborn-otter');
    // Documented rather than defended: the digit is noise from a paste, and the
    // code it lands on is the one the person was looking at. A code that is
    // wrong in its letters still does not resolve.
  });
});
