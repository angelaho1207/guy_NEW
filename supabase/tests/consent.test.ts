// The consent boundary: what one person can learn about another, and when.
//
// Every assertion here runs against the real migrations with row level
// security enforced, as a non-superuser `authenticated` role.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, row, rows, type Db } from './harness.ts';

let db: Db;
let alice: string;
let bob: string;

before(async () => {
  db = await boot();
  alice = await db.createUser('alice');
  bob = await db.createUser('bob');
});

after(async () => {
  await db.close();
});

/** Runs a full QR exchange between two users and returns the exchange id. */
async function completeExchange(a: string, b: string) {
  const minted = row<{ token: string }>(
    await db.as(a, `select * from public.mint_connect_token(120)`),
  );
  const opened = row<{ exchange_id: string }>(
    await db.as(b, `select * from public.open_exchange($1, 'qr')`, [minted.token]),
  );
  const id = opened.exchange_id;
  await db.as(b, `select public.confirm_exchange($1)`, [id]);
  await db.as(a, `select public.confirm_exchange($1)`, [id]);
  return id;
}

describe('profile isolation', () => {
  test('a new profile has every field marked shareable', async () => {
    const res = row<{ total: number; on: number }>(
      await db.as(
        alice,
        `select count(*)::int as total,
                count(*) filter (where shareable)::int as on
           from public.profile_field_shares`,
      ),
    );
    assert.equal(res.total, 18);
    assert.equal(res.on, 18, 'the shareable toggle must default to on');
  });

  test('field share rows are scoped to their owner', async () => {
    // Alice sees 18 rows, not 36, even though Bob's rows exist.
    const res = row<{ n: number }>(
      await db.as(alice, `select count(*)::int as n from public.profile_field_shares`),
    );
    assert.equal(res.n, 18);
  });

  test('one user cannot read another user\'s profile row', async () => {
    await db.as(alice, `update public.profiles set first_name = 'Alice', last_name = 'Alvarez'`);

    const res = await db.as(
      bob,
      `select first_name from public.profiles where user_id = $1`,
      [alice],
    );
    assert.equal(
      rows(res).length,
      0,
      'RLS must hide the raw profile row from everyone but its owner',
    );
  });

  test('one user cannot write another user\'s profile row', async () => {
    await db.as(bob, `update public.profiles set first_name = 'Not', last_name = 'Alice' where user_id = $1`, [
      alice,
    ]);
    const mine = row<{ first_name: string }>(
      await db.as(alice, `select first_name from public.profiles`),
    );
    assert.equal(mine.first_name, 'Alice', 'the update must have affected zero rows');
  });
});

describe('the projection', () => {
  const project = async (subject: string) =>
    row<{ project_shared_profile: Record<string, string> }>(
      await db.admin(`select public.project_shared_profile($1)`, [subject]),
    ).project_shared_profile;

  test('returns every field currently marked shareable', async () => {
    const card = await project(alice);

    // All 18 fields are on by default, so all 18 come back.
    assert.equal(Object.keys(card).length, 18);
    assert.equal(card.first_name, 'Alice');
    assert.equal(card.last_name, 'Alvarez');
  });

  test('a shared field left empty renders as "-" rather than vanishing', async () => {
    assert.equal((await project(alice)).hometown, '-');
  });

  test('whitespace counts as empty', async () => {
    await db.as(alice, `update public.profiles set major = '   '`);
    assert.equal((await project(alice)).major, '-');
  });

  test('a field whose toggle is off is absent, not "-"', async () => {
    await db.as(
      alice,
      `update public.profile_field_shares set shareable = false where field = 'hometown'`,
    );

    const card = await project(alice);
    assert.equal(card.hometown, undefined);
    assert.equal(Object.keys(card).length, 17);

    await db.as(
      alice,
      `update public.profile_field_shares set shareable = true where field = 'hometown'`,
    );
  });

  test('sharing nothing at all projects nothing at all', async () => {
    await db.as(alice, `update public.profile_field_shares set shareable = false`);
    assert.deepEqual(await project(alice), {});

    await db.as(alice, `update public.profile_field_shares set shareable = true`);
  });
});

describe('exchange handshake', () => {
  test('one side confirming shares nothing', async () => {
    const minted = row<{ token: string }>(
      await db.as(alice, `select * from public.mint_connect_token(120)`),
    );
    const id = row<{ exchange_id: string }>(
      await db.as(bob, `select * from public.open_exchange($1, 'qr')`, [minted.token]),
    ).exchange_id;

    const state = row<{ confirm_exchange: string }>(
      await db.as(bob, `select public.confirm_exchange($1)`, [id]),
    ).confirm_exchange;

    assert.equal(state, 'pending');

    const n = row<{ n: number }>(
      await db.admin(`select count(*)::int as n from public.connections`),
    ).n;
    assert.equal(n, 0, 'no connection may exist until both sides confirm');

    await db.as(alice, `select public.decline_exchange($1)`, [id]);
  });

  test('a scan alone never completes an exchange', async () => {
    const minted = row<{ token: string }>(
      await db.as(alice, `select * from public.mint_connect_token(120)`),
    );
    await db.as(bob, `select * from public.open_exchange($1, 'qr')`, [minted.token]);

    const n = row<{ n: number }>(
      await db.admin(`select count(*)::int as n from public.connections`),
    ).n;
    assert.equal(n, 0);

    await db.admin(`update public.exchanges set state = 'expired' where state = 'pending'`);
  });

  test('both confirming creates one row per direction', async () => {
    // Alice keeps her phone number to herself; everything else stays on.
    await db.as(
      alice,
      `update public.profile_field_shares set shareable = false where field = 'phone'`,
    );
    await db.as(alice, `update public.profiles set phone = '+1 555 0100', school = 'Brown'`);
    await db.as(bob, `update public.profiles set first_name = 'Bob', last_name = 'Birch', school = 'Brown'`);

    await completeExchange(alice, bob);

    // Asserted in SQL: the driver renders a Postgres array as a literal string,
    // so counting it in JavaScript would silently measure the wrong thing.
    const conns = rows<{
      owner_id: string;
      field_count: number;
      shares_phone: boolean;
    }>(
      await db.admin(
        `select owner_id,
                coalesce(array_length(fields_at_exchange, 1), 0) as field_count,
                ('phone' = any (fields_at_exchange)) as shares_phone
           from public.connections
          order by owner_id`,
      ),
    );
    assert.equal(conns.length, 2, 'an exchange creates exactly two rows');

    const bobsRow = conns.find((c) => c.owner_id === bob)!;
    const alicesRow = conns.find((c) => c.owner_id === alice)!;

    assert.equal(
      bobsRow.shares_phone,
      false,
      'Alice withheld her phone, so it is not in the record of that exchange',
    );
    assert.equal(Number(bobsRow.field_count), 17);
    assert.equal(
      alicesRow.shares_phone,
      true,
      'Bob shared everything, so Alice\'s row carries his phone field',
    );
    assert.equal(Number(alicesRow.field_count), 18);
  });

  test('the withheld field is absent from the card, not blanked', async () => {
    const card = row<{ card: Record<string, string> }>(
      await db.as(bob, `select card from public.contact_cards`),
    ).card;

    assert.equal(card.school, 'Brown');
    assert.equal(
      card.phone,
      undefined,
      'a field never shared must not appear at all, not even as "-"',
    );
  });

  test('the card reflects the other person\'s later edits', async () => {
    await db.as(alice, `update public.profiles set school = 'Brown University'`);

    const card = row<{ card: Record<string, string> }>(
      await db.as(bob, `select card from public.contact_cards`),
    ).card;

    assert.equal(card.school, 'Brown University');
  });

  test('a confirmation after the 30 second window shares nothing', async () => {
    const charlie = await db.createUser('charlie');
    const minted = row<{ token: string }>(
      await db.as(charlie, `select * from public.mint_connect_token(120)`),
    );
    const id = row<{ exchange_id: string }>(
      await db.as(bob, `select * from public.open_exchange($1, 'qr')`, [minted.token]),
    ).exchange_id;

    await db.as(bob, `select public.confirm_exchange($1)`, [id]);

    // Wind the clock past the window.
    await db.admin(
      `update public.exchanges set expires_at = now() - interval '1 second' where id = '${id}'`,
    );

    const state = row<{ confirm_exchange: string }>(
      await db.as(charlie, `select public.confirm_exchange($1)`, [id]),
    ).confirm_exchange;

    assert.equal(state, 'expired');

    const n = row<{ n: number }>(
      await db.admin(
        `select count(*)::int as n from public.connections where owner_id = '${charlie}' or other_id = '${charlie}'`,
      ),
    ).n;
    assert.equal(n, 0, 'a timed-out exchange leaves nothing behind on either side');
  });

  test('a stranger cannot confirm someone else\'s exchange', async () => {
    const dana = await db.createUser('dana');
    const erin = await db.createUser('erin');
    const minted = row<{ token: string }>(
      await db.as(dana, `select * from public.mint_connect_token(120)`),
    );
    const id = row<{ exchange_id: string }>(
      await db.as(erin, `select * from public.open_exchange($1, 'qr')`, [minted.token]),
    ).exchange_id;

    const err = await db.asExpectingFailure(
      bob,
      `select public.confirm_exchange($1)`,
      [id],
    );
    assert.match(err, /not a party/);
  });
});

describe('notes stay private', () => {
  test('the subject of a note can never read it', async () => {
    const alicesConn = row<{ connection_id: string }>(
      await db.as(alice, `select connection_id from public.contact_cards limit 1`),
    ).connection_id;

    await db.as(
      alice,
      `insert into public.connection_notes (connection_id, body) values ($1, 'seemed evasive about the internship')`,
      [alicesConn],
    );

    const visibleToBob = rows(
      await db.as(bob, `select body from public.connection_notes`),
    );
    assert.equal(visibleToBob.length, 0, 'Bob must not see Alice\'s notes about Bob');

    const visibleToAlice = rows(
      await db.as(alice, `select body from public.connection_notes`),
    );
    assert.equal(visibleToAlice.length, 1);
  });

  test('a note cannot be attached to someone else\'s connection', async () => {
    const alicesConn = row<{ connection_id: string }>(
      await db.as(alice, `select connection_id from public.contact_cards limit 1`),
    ).connection_id;

    const err = await db.asExpectingFailure(
      bob,
      `insert into public.connection_notes (connection_id, body) values ($1, 'injected')`,
      [alicesConn],
    );
    assert.match(err, /row-level security|violates/i);
  });

  test('the other person cannot see your follow-up intent', async () => {
    await db.as(
      alice,
      `update public.connections set want_follow_up = true, follow_up_topic = 'ask about the lab'`,
    );

    const bobsView = rows<{ want_follow_up: boolean | null }>(
      await db.as(bob, `select want_follow_up, follow_up_topic from public.contact_cards`),
    );
    for (const r of bobsView) {
      assert.equal(r.want_follow_up, null, 'follow-up intent is private to its author');
    }
  });
});
