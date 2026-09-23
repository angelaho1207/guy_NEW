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
        set first_name = 'Alice', last_name = 'Alvarez',
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
    await db.as(alice, `select * from public.mint_connect_token(120)`),
  );
  const id = row<{ exchange_id: string }>(
    await db.as(bob, `select * from public.open_exchange($1, 'qr')`, [minted.token]),
  ).exchange_id;
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

  test('Bob cannot rewrite the record of what was shared', async () => {
    const err = await db.asExpectingFailure(
      bob,
      `update public.connections
          set fields_at_exchange = fields_at_exchange || 'phone'::public.profile_field
        where id = $1`,
      [bobConn],
    );
    assert.match(err, /permission denied/i);
  });

  test('Bob cannot replace that record wholesale', async () => {
    const err = await db.asExpectingFailure(
      bob,
      `update public.connections
          set fields_at_exchange = enum_range(null::public.profile_field)
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
      `insert into public.connections (owner_id, other_id, met_via, fields_at_exchange)
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
      await db.as(alice, `select * from public.mint_connect_token(120)`),
    );
    const id = row<{ exchange_id: string }>(
      await db.as(bob, `select * from public.open_exchange($1, 'qr')`, [minted.token]),
    ).exchange_id;

    const err = await db.asExpectingFailure(
      bob,
      `update public.exchanges set state = 'completed' where id = $1`,
      [id],
    );
    assert.match(err, /permission denied/i);
  });

  test('a client cannot forge the other side\'s confirmation', async () => {
    // A fresh pair: Alice and Bob already know each other, and an
    // already-connected pair never opens an exchange at all.
    const erin = await db.createUser('erin', 'Erin', 'East');
    const minted = row<{ token: string }>(
      await db.as(erin, `select * from public.mint_connect_token(120)`),
    );
    const id = row<{ exchange_id: string }>(
      await db.as(bob, `select * from public.open_exchange($1, 'qr')`, [minted.token]),
    ).exchange_id;

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

describe('reaching someone you are not standing next to', () => {
  // Nearby Interaction proves proximity but says nothing about identity, so
  // the account claim has to travel on the Bluetooth channel. It travels as a
  // connect token, never as an account id, which is what stops a modified
  // client raising a prompt on a stranger's phone from anywhere in the world.

  test('there is no way to open an exchange by naming an account', async () => {
    const target = await db.createUser('target', 'Tara', 'Target');

    const err = await db.asExpectingFailure(
      bob,
      `select * from public.open_exchange($1, 'uwb')`,
      [target],
    );
    assert.match(
      err,
      /expired or already used/,
      'an account id is not a token, so it simply does not resolve',
    );

    const n = row<{ n: number }>(
      await db.admin(
        `select count(*)::int as n from public.exchanges
          where responder_id = '${target}'`,
      ),
    );
    assert.equal(Number(n.n), 0, 'no prompt was raised on the target');
  });

  test('a guessed token gets nowhere', async () => {
    const err = await db.asExpectingFailure(
      bob,
      `select * from public.open_exchange($1, 'uwb')`,
      ['not-a-real-token-aaaaaaaaaaaaaaaaaaaaaaaa'],
    );
    assert.match(err, /expired or already used/);
  });

  test('an overheard token stops working once it is spent', async () => {
    // A Bluetooth broadcast can be overheard at range, unlike a QR code that
    // has to be pointed at. Single use is what bounds that exposure.
    const ana = await db.createUser('ana', 'Ana', 'Apple');
    const ben = await db.createUser('ben', 'Ben', 'Birch');
    const eve = await db.createUser('eve', 'Eve', 'Eaves');

    const minted = row<{ token: string }>(
      await db.as(ana, `select * from public.mint_connect_token(120)`),
    );

    // Ben is the one actually standing there, and redeems it.
    const opened = row<{ status: string }>(
      await db.as(ben, `select * from public.open_exchange($1, 'uwb')`, [minted.token]),
    );
    assert.equal(opened.status, 'opened');

    // Eve overheard the same broadcast and tries to reuse it.
    const err = await db.asExpectingFailure(
      eve,
      `select * from public.open_exchange($1, 'uwb')`,
      [minted.token],
    );
    assert.match(err, /expired or already used/);
  });

  test('a token is useless once it expires, even unspent', async () => {
    const ana = await db.createUser('ana2', 'Ana', 'Apple');
    const minted = row<{ token: string }>(
      await db.as(ana, `select * from public.mint_connect_token(120)`),
    );
    await db.admin(
      `update public.connect_tokens set expires_at = now() - interval '1 second'
        where token = $1`,
      [minted.token],
    );

    const err = await db.asExpectingFailure(
      bob,
      `select * from public.open_exchange($1, 'uwb')`,
      [minted.token],
    );
    assert.match(err, /expired or already used/);
  });

  test('both paths redeem the same kind of token', async () => {
    // One trust model, not two. The method argument only records how they met.
    const ana = await db.createUser('ana3', 'Ana', 'Apple');
    const minted = row<{ token: string }>(
      await db.as(ana, `select * from public.mint_connect_token(120)`),
    );

    const opened = row<{ status: string; exchange_id: string }>(
      await db.as(bob, `select * from public.open_exchange($1, 'uwb')`, [minted.token]),
    );
    assert.equal(opened.status, 'opened');

    const ex = row<{ method: string }>(
      await db.admin(
        `select method from public.exchanges where id = '${opened.exchange_id}'`,
      ),
    );
    assert.equal(ex.method, 'uwb', 'the method is recorded, not trusted');
  });
});

describe('reading other people directly', () => {
  test('the raw profile table yields nothing for another user', async () => {
    const seen = rows(
      await db.as(bob, `select * from public.profiles where user_id = '${alice}'`),
    );
    assert.equal(seen.length, 0);
  });

  test('the projection refuses a profile the caller has no connection to', async () => {
    // The function is granted to `authenticated`, because the views run as
    // their caller. So a client can invoke it directly, and it has to defend
    // itself rather than trust the view that normally calls it.
    const dana = await db.createUser('dana', 'Dana', 'Doe');
    const err = await db.asExpectingFailure(
      bob,
      `select public.project_shared_profile($1)`,
      [dana],
    );
    assert.match(err, /not authorised/i);
  });

  test('the caller cannot ask for a field set of its own choosing', async () => {
    // There is no field-list argument any more. Visibility is decided entirely
    // by the subject's own toggles, so there is nothing for a caller to widen.
    const err = await db.asExpectingFailure(
      bob,
      `select public.project_shared_profile($1, array['phone']::public.profile_field[])`,
      [alice],
    );
    assert.match(err, /does not exist/i);
  });

  test('a connected caller gets exactly what the subject currently shares', async () => {
    const card = row<{ project_shared_profile: Record<string, string> }>(
      await db.as(bob, `select public.project_shared_profile($1)`, [alice]),
    ).project_shared_profile;

    assert.equal(card.school, 'Brown');
    assert.equal(card.phone, undefined, 'still bounded by Alice\'s own toggles');
    assert.equal(card.personal_email, undefined);
  });

  test('and the contacts list still works end to end', async () => {
    const card = row<{ card: Record<string, string> }>(
      await db.as(bob, `select card from public.contact_cards`),
    ).card;

    assert.equal(card.first_name, 'Alice');
    assert.equal(card.last_name, 'Alvarez');
    assert.equal(card.phone, undefined);
  });
});
