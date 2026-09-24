// Nearby connect, by presence.
//
// The rule being tested throughout: you appear to someone only if you BOTH
// have the connect screen open right now. Location merely narrows the list.
// A directory you can browse without being in it yourself would be a very
// different product, and these tests are what stop it becoming one.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, row, rows, type Db } from './harness.ts';

let db: Db;
let alice: string;
let bob: string;
let carol: string;

// Two points about 60m apart, and one several kilometres away.
const HERE: [number, number] = [41.8268, -71.4025];
const NEXT_TO_HERE: [number, number] = [41.82734, -71.4025];
const ACROSS_TOWN: [number, number] = [41.8712, -71.4102];

const arrive = (uid: string, at: [number, number] | null, network?: string) =>
  db.as(
    uid,
    `select * from public.start_presence($1, $2, $3, $4)`,
    [at?.[0] ?? null, at?.[1] ?? null, at ? 12 : null, network ?? null],
  );

const leave = (uid: string) => db.as(uid, `select public.end_presence()`);

type Nearby = {
  user_id: string;
  display_name: string;
  metres: number | null;
  same_network: boolean;
  already_connected: boolean;
};

const listFor = async (uid: string) =>
  rows<Nearby>(await db.as(uid, `select * from public.nearby_people()`));

before(async () => {
  db = await boot();
  alice = await db.createUser('alice', 'Alice', 'Alvarez');
  bob = await db.createUser('bob', 'Bob', 'Birch');
  carol = await db.createUser('carol', 'Carol', 'Chen');
});

after(async () => {
  await db.close();
});

describe('who appears on the list', () => {
  test('nobody, when you are the only one with the screen open', async () => {
    await arrive(alice, HERE);
    assert.deepEqual(await listFor(alice), []);
  });

  test('someone else with the screen open, close by', async () => {
    await arrive(bob, NEXT_TO_HERE);

    const mine = await listFor(alice);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].user_id, bob);
    assert.equal(mine[0].display_name, 'Bob Birch');
    assert.ok(
      Number(mine[0].metres) > 0 && Number(mine[0].metres) < 150,
      `expected a distance under the radius, got ${mine[0].metres}`,
    );
  });

  test('and it is mutual', async () => {
    const theirs = await listFor(bob);
    assert.equal(theirs.length, 1);
    assert.equal(theirs[0].user_id, alice);
  });

  test('not someone across town', async () => {
    await arrive(carol, ACROSS_TOWN);

    const mine = await listFor(alice);
    assert.deepEqual(mine.map((r) => r.user_id), [bob]);
  });

  test('not someone who closed the screen', async () => {
    await leave(bob);
    assert.deepEqual(await listFor(alice), []);
  });

  test('not someone whose heartbeat went stale', async () => {
    await arrive(bob, NEXT_TO_HERE);
    assert.equal((await listFor(alice)).length, 1);

    await db.admin(
      `update public.connect_presence set seen_at = now() - interval '2 minutes'
        where user_id = '${bob}'`,
    );
    assert.deepEqual(await listFor(alice), []);

    await arrive(bob, NEXT_TO_HERE);
  });

  test('you cannot see the list without being on it yourself', async () => {
    // The whole design rests on this. Looking without being visible would make
    // presence a directory of who is where.
    await leave(alice);
    assert.deepEqual(await listFor(alice), []);

    await arrive(alice, HERE);
    assert.equal((await listFor(alice)).length, 1);
  });

  test('nobody can read anyone else\'s presence row directly', async () => {
    const seen = rows(
      await db.as(alice, `select * from public.connect_presence where user_id = $1`, [
        bob,
      ]),
    );
    assert.equal(seen.length, 0, 'RLS must keep presence rows to their owner');
  });
});

describe('when there is no location', () => {
  test('the same network is enough to find each other', async () => {
    await arrive(alice, null, 'hash-of-venue-wifi');
    await arrive(bob, null, 'hash-of-venue-wifi');

    const mine = await listFor(alice);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].user_id, bob);
    assert.equal(mine[0].same_network, true);
    assert.equal(mine[0].metres, null, 'no coordinates means no distance');
  });

  test('a different network is not', async () => {
    await arrive(bob, null, 'hash-of-somewhere-else');
    assert.deepEqual(await listFor(alice), []);
  });

  test('and with neither location nor network, you find nobody', async () => {
    await arrive(alice, null, null);
    await arrive(bob, null, null);
    assert.deepEqual(await listFor(alice), []);
  });

  test('someone who refused location is invisible, and sees nobody', async () => {
    // The web app tells anyone who denies the permission that nearby cannot
    // work for them and points them at the code instead. This is the
    // behaviour that copy is describing, in both directions: distance is null
    // when either side lacks coordinates, and a null comparison is not a
    // match. If this ever softened, that screen would be lying.
    await arrive(alice, HERE);
    await arrive(bob, null, null);

    assert.deepEqual(await listFor(alice), [], 'they do not appear to you');
    assert.deepEqual(await listFor(bob), [], 'and you do not appear to them');
  });
});

describe('names on the list', () => {
  test('fall back to the username when the name is not shared', async () => {
    await arrive(alice, HERE);
    await arrive(bob, NEXT_TO_HERE);

    await db.as(
      bob,
      `update public.profile_field_shares set shareable = false where field = 'last_name'`,
    );

    const mine = await listFor(alice);
    assert.equal(mine[0].display_name, 'bob');

    await db.as(
      bob,
      `update public.profile_field_shares set shareable = true where field = 'last_name'`,
    );
  });

  test('and nothing else about them is on the list', async () => {
    // Nothing has been agreed yet, so a name and a distance is the whole of it.
    const listed = await listFor(alice);
    const columns = Object.keys(listed[0]).sort();
    assert.deepEqual(columns, [
      'already_connected',
      'display_name',
      'metres',
      'same_network',
      'user_id',
    ]);
  });
});

describe('starting an exchange from the list', () => {
  test('opens a handshake both people must confirm', async () => {
    const opened = row<{ status: string; exchange_id: string }>(
      await db.as(alice, `select * from public.open_nearby_exchange($1)`, [bob]),
    );
    assert.equal(opened.status, 'opened');

    const n = row<{ n: number }>(
      await db.admin(`select count(*)::int as n from public.connections`),
    );
    assert.equal(Number(n.n), 0, 'opening shares nothing on its own');

    await db.as(bob, `select public.confirm_exchange($1)`, [opened.exchange_id]);
    await db.as(alice, `select public.confirm_exchange($1)`, [opened.exchange_id]);

    const after = row<{ n: number }>(
      await db.admin(`select count(*)::int as n from public.connections`),
    );
    assert.equal(Number(after.n), 2);
  });

  test('records how they met', async () => {
    const c = row<{ met_via: string }>(
      await db.admin(
        `select met_via from public.connections where owner_id = '${alice}'`,
      ),
    );
    assert.equal(c.met_via, 'nearby');
  });

  test('says so when you already know each other', async () => {
    const again = row<{ status: string; exchange_id: string | null }>(
      await db.as(alice, `select * from public.open_nearby_exchange($1)`, [bob]),
    );
    assert.equal(again.status, 'already_connected');
    assert.equal(again.exchange_id, null);
  });

  test('and the list marks them so the UI need not guess', async () => {
    const mine = await listFor(alice);
    assert.equal(mine[0].already_connected, true);
  });
});

describe('naming someone who is not nearby', () => {
  // Every other connect path refuses an account id outright. This one accepts
  // it, so the server has to be the thing deciding, not the caller.

  test('is refused when they have no presence at all', async () => {
    const dana = await db.createUser('dana', 'Dana', 'Doe');
    const err = await db.asExpectingFailure(
      alice,
      `select * from public.open_nearby_exchange($1)`,
      [dana],
    );
    assert.match(err, /not nearby/);
  });

  test('is refused when they are present but far away', async () => {
    await arrive(carol, ACROSS_TOWN);
    const err = await db.asExpectingFailure(
      alice,
      `select * from public.open_nearby_exchange($1)`,
      [carol],
    );
    assert.match(err, /not nearby/);
  });

  test('is refused when you are not on the screen yourself', async () => {
    await leave(alice);
    const err = await db.asExpectingFailure(
      alice,
      `select * from public.open_nearby_exchange($1)`,
      [carol],
    );
    assert.match(err, /not nearby/);

    await arrive(alice, HERE);
  });

  test('is refused for yourself', async () => {
    const err = await db.asExpectingFailure(
      alice,
      `select * from public.open_nearby_exchange($1)`,
      [alice],
    );
    assert.match(err, /yourself/);
  });
});

describe('leaving no trace', () => {
  test('closing the screen deletes the row', async () => {
    await arrive(alice, HERE);
    await leave(alice);

    const n = row<{ n: number }>(
      await db.admin(
        `select count(*)::int as n from public.connect_presence where user_id = '${alice}'`,
      ),
    );
    assert.equal(Number(n.n), 0);
  });

  test('a phone that vanished mid-screen is swept up', async () => {
    await arrive(alice, HERE);
    await db.admin(
      `update public.connect_presence set seen_at = now() - interval '5 minutes'`,
    );

    const purged = row<{ purge_stale_presence: number }>(
      await db.admin(`select public.purge_stale_presence()`),
    );
    assert.ok(Number(purged.purge_stale_presence) >= 1);

    const left = row<{ n: number }>(
      await db.admin(`select count(*)::int as n from public.connect_presence`),
    );
    assert.equal(Number(left.n), 0, 'a stale row is someone appearing to be somewhere they are not');
  });

  test('presence keeps no history', async () => {
    // One row per person at most, ever. If this becomes a log, it becomes a
    // record of where people have been.
    await arrive(bob, HERE);
    await arrive(bob, NEXT_TO_HERE);
    await arrive(bob, ACROSS_TOWN);

    const n = row<{ n: number }>(
      await db.admin(
        `select count(*)::int as n from public.connect_presence where user_id = '${bob}'`,
      ),
    );
    assert.equal(Number(n.n), 1);
  });
});
