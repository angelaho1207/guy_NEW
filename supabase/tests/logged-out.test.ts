// What someone holding only the publishable key can reach.
//
// That key ships in the browser bundle and is meant to be public, so this is
// the surface the whole internet has. Postgres grants EXECUTE on every new
// function to PUBLIC by default, which quietly includes Supabase's `anon`
// role, so this was wide open until migration 0006 closed it.
//
// The functions all refuse an unauthenticated caller on their own, which is
// why nothing leaked. These tests hold both lines: that they still refuse, and
// that a logged-out caller cannot reach them in the first place.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, rows, type Db } from './harness.ts';

let db: Db;
let alice: string;

before(async () => {
  db = await boot();
  alice = await db.createUser('alice', 'Alice', 'Alvarez');
});

after(async () => {
  await db.close();
});

describe('tables and views', () => {
  for (const relation of [
    'profiles',
    'profile_field_shares',
    'connections',
    'connection_notes',
    'reminders',
    'one_on_one_requests',
    'one_on_one_messages',
    'connect_tokens',
    'connect_presence',
    'exchanges',
    'push_tokens',
    'push_outbox',
    'contact_cards',
    'undone_follow_ups',
    'visible_one_on_ones',
  ]) {
    test(`${relation} is unreadable`, async () => {
      const err = await db.asAnonExpectingFailure(`select * from public.${relation}`);
      assert.match(err, /permission denied/i);
    });
  }
});

describe('functions a client may call once signed in', () => {
  // Still unreachable logged out. The point is not that they would misbehave,
  // it is that an anonymous caller has no business reaching them.
  for (const [label, call] of [
    ['mint_connect_token', `select * from public.mint_connect_token(120)`],
    ['nearby_people', `select * from public.nearby_people()`],
    ['end_presence', `select public.end_presence()`],
    ['start_presence', `select * from public.start_presence(1, 1, 1, null)`],
  ] as const) {
    test(`${label} is not callable`, async () => {
      const err = await db.asAnonExpectingFailure(call);
      assert.match(err, /permission denied/i);
    });
  }
});

describe('the scheduled jobs', () => {
  // These are pg_cron's. They are written to be idempotent and to act only on
  // rows already due, so the worst case was ever someone doing cron's work
  // early. A client should still not be able to touch them.
  for (const fn of [
    'fire_due_reminders',
    'expire_stale_one_on_ones',
    'expire_stale_exchanges',
    'purge_spent_connect_tokens',
    'purge_stale_presence',
  ]) {
    test(`${fn} is not callable`, async () => {
      const err = await db.asAnonExpectingFailure(`select public.${fn}()`);
      assert.match(err, /permission denied/i);
    });
  }
});

describe('the two that actually said something', () => {
  test('name_for no longer answers a logged-out caller', async () => {
    // It used to. With no connection it fell through to the username, so
    // anyone holding a uuid could confirm the account existed and learn its
    // handle.
    const err = await db.asAnonExpectingFailure(`select public.name_for($1)`, [alice]);
    assert.match(err, /permission denied/i);
  });

  test('display_name_for is unreachable even signed in', async () => {
    // It takes the viewer as an argument, so a client could ask what someone
    // else is allowed to see. name_for() is the caller-pinned version.
    const err = await db.asExpectingFailure(
      alice,
      `select public.display_name_for($1, $1)`,
      [alice],
    );
    assert.match(err, /permission denied/i);
  });
});

describe('the internals stay internal', () => {
  for (const [label, call, params] of [
    ['shareable_fields', `select public.shareable_fields($1)`, true],
    ['metres_between', `select public.metres_between(1, 1, 2, 2)`, false],
    ['presence_ttl', `select public.presence_ttl()`, false],
    ['nearby_radius_m', `select public.nearby_radius_m()`, false],
  ] as const) {
    test(`${label} is not callable by a signed-in client either`, async () => {
      const err = await db.asExpectingFailure(
        alice,
        call,
        params ? [alice] : undefined,
      );
      assert.match(err, /permission denied/i);
    });
  }
});

describe('what still works', () => {
  test('a signed-in user can still do everything the app needs', async () => {
    // The revoke was broad, so this is the guard against having revoked
    // something the app depends on. If a grant was missed, this fails.
    const bob = await db.createUser('bob', 'Bob', 'Birch');

    const minted = rows<{ token: string }>(
      await db.as(alice, `select * from public.mint_connect_token(120)`),
    );
    const opened = rows<{ exchange_id: string }>(
      await db.as(bob, `select * from public.open_exchange($1, 'qr')`, [
        minted[0].token,
      ]),
    );
    await db.as(bob, `select public.confirm_exchange($1)`, [opened[0].exchange_id]);
    await db.as(alice, `select public.confirm_exchange($1)`, [opened[0].exchange_id]);

    const cards = rows(await db.as(alice, `select card from public.contact_cards`));
    assert.equal(cards.length, 1, 'the contacts list must still read');

    const conn = rows<{ connection_id: string }>(
      await db.as(alice, `select connection_id from public.contact_cards`),
    );
    await db.as(alice, `select public.set_reminder($1, 1, 0)`, [conn[0].connection_id]);
    await db.as(alice, `select public.request_one_on_one($1)`, [conn[0].connection_id]);
    await db.as(alice, `select public.name_for($1)`, [bob]);
    await db.as(alice, `select * from public.start_presence(1, 1, 5, null)`);
    await db.as(alice, `select * from public.nearby_people()`);
    await db.as(alice, `select public.end_presence()`);
  });
});
