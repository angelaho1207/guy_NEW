// Things a modified client would try.
//
// Row policies answer "is this your row". They do not answer "may you change
// this particular column of your own row", and three columns in this schema
// are owned by the system even though they live on a row the user owns. These
// tests are the proof that column-level grants close that gap.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, row, rows, type Db } from './harness.ts';

let db: Db;
let alice: string;
let bob: string;
let bobConn: string; // Bob's row about Alice

before(async () => {
  db = await boot();
  alice = await db.createUser('alice');
  bob = await db.createUser('bob');

  // Alice fills everything in but keeps her phone and personal email private.
  await db.as(
    alice,
    `update public.profiles
        set name = 'Alice Alvarez',
            school = 'Brown',
            phone = '+15550100',
            personal_email = 'alice@personal.example'`,
  );
  await db.as(
    alice,
    `update public.profile_field_shares set shareable = false
      where field in ('phone', 'personal_email')`,
  );

  const minted = row<{ token: string }>(
    await db.as(alice, `select * from public.mint_qr_token(120)`),
  );
  const id = row<{ open_qr_exchange: string }>(
    await db.as(bob, `select public.open_qr_exchange($1)`, [minted.token]),
  ).open_qr_exchange;
  await db.as(bob, `select public.confirm_exchange($1)`, [id]);
  await db.as(alice, `select public.confirm_exchange($1)`, [id]);

  bobConn = row<{ id: string }>(
    await db.admin(`select id from public.connections where owner_id = '${bob}'`),
  ).id;
});

after(async () => {
  await db.close();
});

describe('widening your own connection row', () => {
  test('the baseline: Alice\'s withheld fields are not in Bob\'s card', async () => {
    const card = row<{ card: Record<string, string> }>(
      await db.as(bob, `select card from public.contact_cards`),
    ).card;

    assert.equal(card.school, 'Brown');
    assert.equal(card.phone, undefined);
    assert.equal(card.personal_email, undefined);
  });

  test('Bob cannot add a field to his own shared_fields', async () => {
    const err = await db.asExpectingFailure(
      bob,
      `update public.connections
          set shared_fields = shared_fields || 'phone'::public.profile_field
        where id = $1`,
      [bobConn],
    );
    assert.match(err, /permission denied/i);
  });

  test('Bob cannot replace shared_fields wholesale', async () => {
    const err = await db.asExpectingFailure(
      bob,
      `update public.connections
          set shared_fields = enum_range(null::public.profile_field)
        where id = $1`,
      [bobConn],
    );
    assert.match(err, /permission denied/i);
  });

  test('and the card is unchanged after both attempts', async () => {
    const card = row<{ card: Record<string, string> }>(
      await db.as(bob, `select card from public.contact_cards`),
    ).card;
    assert.equal(card.phone, undefined, 'Alice\'s phone must still be invisible');
  });

  test('Bob can still edit his own notes fields on that row', async () => {
    await db.as(
      bob,
      `update public.connections
          set how_we_met = 'career fair, by the stairs',
              want_follow_up = true
        where id = $1`,
      [bobConn],
    );
    const r = row<{ how_we_met: string }>(
      await db.as(bob, `select how_we_met from public.contact_cards`),
    );
    assert.equal(r.how_we_met, 'career fair, by the stairs');
  });

  test('Bob cannot repoint the row at someone else', async () => {
    const err = await db.asExpectingFailure(
      bob,
      `update public.connections set other_id = $1 where id = $2`,
      [bob, bobConn],
    );
    assert.match(err, /permission denied/i);
  });

  test('Bob cannot fabricate a connection to someone he never met', async () => {
    const carol = await db.createUser('carol');
    const err = await db.asExpectingFailure(
      bob,
      `insert into public.connections (owner_id, other_id, met_via, shared_fields)
       values ($1, $2, 'qr', enum_range(null::public.profile_field))`,
      [bob, carol],
    );
    assert.match(err, /permission denied/i);
  });
});

describe('routing around the reminder bounds', () => {
  test('a reminder cannot be inserted directly', async () => {
    const err = await db.asExpectingFailure(
      bob,
      `insert into public.reminders (connection_id, days, hours, fire_at)
       values ($1, 1, 0, now() + interval '90 days')`,
      [bobConn],
    );
    assert.match(err, /permission denied/i);
  });

  test('fire_at cannot be moved after the fact', async () => {
    await db.as(bob, `select public.set_reminder($1, 1, 0)`, [bobConn]);

    const err = await db.asExpectingFailure(
      bob,
      `update public.reminders set fire_at = now() + interval '90 days'
        where connection_id = $1`,
      [bobConn],
    );
    assert.match(err, /permission denied/i);
  });

  test('but marking the follow-up done still works', async () => {
    await db.as(
      bob,
      `update public.reminders set done_at = now() where connection_id = $1`,
      [bobConn],
    );
    const r = row<{ done_at: string | null }>(
      await db.admin(
        `select done_at from public.reminders where connection_id = '${bobConn}'`,
      ),
    );
    assert.notEqual(r.done_at, null);
  });
});

describe('identity columns', () => {
  test('a username cannot be changed from the client', async () => {
    const err = await db.asExpectingFailure(
      bob,
      `update public.profiles set username = 'alice_real'`,
    );
    assert.match(err, /permission denied/i);
  });

  test('but ordinary profile fields can', async () => {
    await db.as(bob, `update public.profiles set school = 'RISD'`);
    const r = row<{ school: string }>(
      await db.as(bob, `select school from public.profiles`),
    );
    assert.equal(r.school, 'RISD');
  });

  test('a shareable toggle can be flipped, but not reassigned to another user', async () => {
    await db.as(
      bob,
      `update public.profile_field_shares set shareable = false where field = 'hometown'`,
    );
    const off = row<{ n: number }>(
      await db.as(
        bob,
        `select count(*)::int as n from public.profile_field_shares where not shareable`,
      ),
    );
    assert.equal(Number(off.n), 1);

    const err = await db.asExpectingFailure(
      bob,
      `update public.profile_field_shares set user_id = $1 where field = 'hometown'`,
      [alice],
    );
    assert.match(err, /permission denied/i);
  });

  test('flipping a toggle off does not disturb anyone else\'s toggles', async () => {
    const alices = row<{ n: number }>(
      await db.as(
        alice,
        `select count(*)::int as n from public.profile_field_shares where not shareable`,
      ),
    );
    assert.equal(Number(alices.n), 2, 'Alice still has exactly her own two off');
  });
});

describe('the exchange state machine', () => {
  test('a client cannot mark an exchange completed itself', async () => {
    const minted = row<{ token: string }>(
      await db.as(alice, `select * from public.mint_qr_token(120)`),
    );
    const id = row<{ open_qr_exchange: string }>(
      await db.as(bob, `select public.open_qr_exchange($1)`, [minted.token]),
    ).open_qr_exchange;

    const err = await db.asExpectingFailure(
      bob,
      `update public.exchanges set state = 'completed' where id = $1`,
      [id],
    );
    assert.match(err, /permission denied/i);
  });

  test('a client cannot forge the other side\'s confirmation', async () => {
    const minted = row<{ token: string }>(
      await db.as(alice, `select * from public.mint_qr_token(120)`),
    );
    const id = row<{ open_qr_exchange: string }>(
      await db.as(bob, `select public.open_qr_exchange($1)`, [minted.token]),
    ).open_qr_exchange;

    // Bob confirms for himself, which is allowed.
    await db.as(bob, `select public.confirm_exchange($1)`, [id]);

    // Writing Alice's confirmation timestamp is not.
    const err = await db.asExpectingFailure(
      bob,
      `update public.exchanges set responder_confirmed_at = now() where id = $1`,
      [id],
    );
    assert.match(err, /permission denied/i);
  });

  test('a client cannot approve a 1:1 on the other person\'s behalf', async () => {
    const requestId = row<{ id: string }>(
      await db.admin(
        `insert into public.one_on_one_requests (requester_id, recipient_id, connection_id)
         values ('${bob}', '${alice}', '${bobConn}') returning id`,
      ),
    ).id;

    const err = await db.asExpectingFailure(
      bob,
      `update public.one_on_one_requests set status = 'approved', approved_at = now()
        where id = $1`,
      [requestId],
    );
    assert.match(err, /permission denied/i);
  });
});

describe('reading other people directly', () => {
  test('the raw profile table yields nothing for another user', async () => {
    const seen = rows(
      await db.as(bob, `select * from public.profiles where user_id = '${alice}'`),
    );
    assert.equal(seen.length, 0);
  });

  test('the projection refuses a field set the caller did not earn', async () => {
    // The function is granted to `authenticated`, because the views run as
    // their caller. So a client can invoke it directly with arguments of its
    // own choosing, and it has to defend itself rather than trust the view.
    const err = await db.asExpectingFailure(
      bob,
      `select public.project_shared_profile($1, array['phone']::public.profile_field[])`,
      [alice],
    );
    assert.match(err, /not authorised/i);
  });

  test('the projection refuses a profile the caller has no connection to', async () => {
    const dana = await db.createUser('dana');
    const err = await db.asExpectingFailure(
      bob,
      `select public.project_shared_profile($1, array['name']::public.profile_field[])`,
      [dana],
    );
    assert.match(err, /not authorised/i);
  });

  test('but the field set the caller did earn still projects', async () => {
    const card = row<{ project_shared_profile: Record<string, string> }>(
      await db.as(
        bob,
        `select public.project_shared_profile($1, array['school']::public.profile_field[])`,
        [alice],
      ),
    ).project_shared_profile;

    assert.equal(card.school, 'Brown');
  });

  test('and the contacts list still works end to end', async () => {
    const card = row<{ card: Record<string, string> }>(
      await db.as(bob, `select card from public.contact_cards`),
    ).card;

    assert.equal(card.name, 'Alice Alvarez');
    assert.equal(card.phone, undefined);
  });
});
