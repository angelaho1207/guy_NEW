// The behaviours settled after the first round of open questions:
//
//   Q1  visibility follows the owner's CURRENT shareable toggles and nothing
//       else. Off hides the field from everyone immediately; on reveals it to
//       everyone immediately, including people met while it was off.
//   Q2  first and last name are required, and the only required fields
//   Q3  sharing Discord carries the numeric id that makes it tappable
//   Q6  tapping someone you already know says so and does nothing

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, row, type Db } from './harness.ts';

let db: Db;
let alice: string;
let bob: string;

before(async () => {
  db = await boot();
  alice = await db.createUser('alice', 'Alice', 'Alvarez');
  bob = await db.createUser('bob', 'Bob', 'Birch');

  await db.as(alice, `update public.profiles set school = 'Brown', phone = '+15550100'`);

  // Alice withholds her phone before they ever meet, so it is not in the
  // record of that exchange. Everything else is on by default.
  await db.as(
    alice,
    `update public.profile_field_shares set shareable = false where field = 'phone'`,
  );

  const minted = row<{ token: string }>(
    await db.as(alice, `select * from public.mint_qr_token(120)`),
  );
  const id = row<{ exchange_id: string }>(
    await db.as(bob, `select * from public.open_qr_exchange($1)`, [minted.token]),
  ).exchange_id;
  await db.as(bob, `select public.confirm_exchange($1)`, [id]);
  await db.as(alice, `select public.confirm_exchange($1)`, [id]);
});

after(async () => {
  await db.close();
});

/** Bob's card for Alice, as the contacts list would render it. */
async function bobsCard(): Promise<Record<string, string>> {
  return row<{ card: Record<string, string> }>(
    await db.as(bob, `select card from public.contact_cards`),
  ).card;
}

async function setShare(user: string, field: string, on: boolean) {
  await db.as(
    user,
    `update public.profile_field_shares set shareable = $1 where field = $2`,
    [on, field],
  );
}

describe('revoking consent after the fact', () => {
  test('the baseline: Bob can see Alice\'s school', async () => {
    assert.equal((await bobsCard()).school, 'Brown');
  });

  test('turning the toggle off hides the field from an existing connection', async () => {
    await setShare(alice, 'school', false);
    assert.equal(
      (await bobsCard()).school,
      undefined,
      'revocation must reach people who already have the field',
    );
  });

  test('revocation does not rewrite the record of what was shared that day', async () => {
    const recorded = row<{ still_recorded: boolean }>(
      await db.admin(
        `select ('school' = any (fields_at_exchange)) as still_recorded
           from public.connections where owner_id = '${bob}'`,
      ),
    );
    assert.equal(
      recorded.still_recorded,
      true,
      'fields_at_exchange is history and does not move; the toggle decides what shows',
    );
  });

  test('turning it back on shows the value as it stands now, not as it was', async () => {
    await db.as(alice, `update public.profiles set school = 'RISD'`);
    await setShare(alice, 'school', true);

    assert.equal((await bobsCard()).school, 'RISD');
  });

  test('a field that was off when they met becomes visible once it goes on', async () => {
    // Alice's phone was off when she and Bob exchanged, so Bob never saw it.
    // Turning it on now reveals it to him, the same as to anyone else: there
    // is no per-connection field set holding him back.
    assert.equal((await bobsCard()).phone, undefined, 'hidden while the toggle is off');

    await setShare(alice, 'phone', true);

    assert.equal(
      (await bobsCard()).phone,
      '+15550100',
      'turning it on reaches people met while it was off, not only new ones',
    );

    await setShare(alice, 'phone', false);
    assert.equal((await bobsCard()).phone, undefined, 'and turning it off hides it again');
  });

  test('what was recorded at the exchange does not limit what shows now', async () => {
    const recorded = row<{ was_shared: boolean }>(
      await db.admin(
        `select ('phone' = any (fields_at_exchange)) as was_shared
           from public.connections where owner_id = '${bob}'`,
      ),
    );
    assert.equal(recorded.was_shared, false, 'phone was off the day they met');

    await setShare(alice, 'phone', true);
    assert.equal(
      (await bobsCard()).phone,
      '+15550100',
      'and yet it shows, because visibility follows the toggle alone',
    );

    await setShare(alice, 'phone', false);
  });

  test('revoking one field leaves the others alone', async () => {
    await setShare(alice, 'hometown', false);
    const card = await bobsCard();

    assert.equal(card.hometown, undefined);
    assert.equal(card.school, 'RISD');
    assert.equal(card.first_name, 'Alice');

    await setShare(alice, 'hometown', true);
  });

  test('a revoked field reads as absent, not as the empty marker', async () => {
    // "-" means they left it blank. Absent means they did not share it. The
    // two must not be confused, or revocation looks like an empty profile.
    await setShare(alice, 'major', false);
    const card = await bobsCard();

    assert.equal(card.major, undefined);
    assert.notEqual(card.major, '-');

    await setShare(alice, 'major', true);
    assert.equal((await bobsCard()).major, '-', 'shared but blank is still "-"');
  });
});

describe('Discord', () => {
  test('sharing the username carries the id that makes it tappable', async () => {
    await db.as(
      alice,
      `update public.profiles set discord = 'alicea', discord_id = '123456789012345678'`,
    );

    const card = await bobsCard();
    assert.equal(card.discord, 'alicea');
    assert.equal(card.discord_id, '123456789012345678');
  });

  test('without an id the username still shares, just not linkably', async () => {
    await db.as(alice, `update public.profiles set discord_id = null`);

    const card = await bobsCard();
    assert.equal(card.discord, 'alicea');
    assert.equal(card.discord_id, undefined);
  });

  test('withholding Discord withholds the id with it', async () => {
    await db.as(alice, `update public.profiles set discord_id = '123456789012345678'`);
    await setShare(alice, 'discord', false);

    const card = await bobsCard();
    assert.equal(card.discord, undefined);
    assert.equal(
      card.discord_id,
      undefined,
      'the id must never outlive the username it belongs to',
    );

    await setShare(alice, 'discord', true);
  });

  test('a non-numeric Discord id is rejected', async () => {
    const err = await db.asExpectingFailure(
      alice,
      `update public.profiles set discord_id = 'alicea'`,
    );
    assert.match(err, /discord_id_numeric|violates check/i);
  });
});

describe('required profile content', () => {
  const badSignups: [string, string][] = [
    ['no first name', `jsonb_build_object('username', 'nofirst', 'last_name', 'Only')`],
    ['no last name', `jsonb_build_object('username', 'nolast', 'first_name', 'Only')`],
    ['neither', `jsonb_build_object('username', 'noname')`],
    [
      'whitespace only',
      `jsonb_build_object('username', 'blank', 'first_name', '  ', 'last_name', 'X')`,
    ],
  ];

  for (const [label, meta] of badSignups) {
    test(`signup is rejected with ${label}`, async () => {
      let failed = false;
      try {
        await db.admin(`insert into auth.users (raw_user_meta_data) values (${meta})`);
      } catch (err: any) {
        failed = true;
        assert.match(String(err.message), /first name and last name are required/);
      }
      assert.ok(failed, 'expected the signup to be rejected');
    });
  }

  test('everything except the two names is still optional', async () => {
    const id = await db.createUser('minimal', 'Min', 'Imal');
    const r = row<{ school: string | null; first_name: string }>(
      await db.as(id, `select school, first_name from public.profiles`),
    );
    assert.equal(r.school, null);
    assert.equal(r.first_name, 'Min');
  });

  test('a name is required but may still be withheld from sharing', async () => {
    // Required means "must be filled in", not "must be shared".
    await setShare(alice, 'first_name', false);
    assert.equal((await bobsCard()).first_name, undefined);

    await setShare(alice, 'first_name', true);
    assert.equal((await bobsCard()).first_name, 'Alice');
  });
});

describe('tapping someone you already know', () => {
  test('says "already connected" instead of opening an exchange', async () => {
    const minted = row<{ token: string }>(
      await db.as(alice, `select * from public.mint_qr_token(120)`),
    );
    const before = Number(
      row<{ n: number }>(
        await db.admin(`select count(*)::int as n from public.exchanges`),
      ).n,
    );

    const result = row<{ status: string; exchange_id: string | null }>(
      await db.as(bob, `select * from public.open_qr_exchange($1)`, [minted.token]),
    );

    assert.equal(result.status, 'already_connected');
    assert.equal(result.exchange_id, null, 'no handshake, so no prompt on either phone');

    const after = Number(
      row<{ n: number }>(
        await db.admin(`select count(*)::int as n from public.exchanges`),
      ).n,
    );
    assert.equal(after, before, 'no exchange row was created');
  });

  test('and the scanned code is left unspent', async () => {
    const minted = row<{ token: string }>(
      await db.as(alice, `select * from public.mint_qr_token(120)`),
    );
    await db.as(bob, `select * from public.open_qr_exchange($1)`, [minted.token]);

    const t = row<{ consumed_at: string | null }>(
      await db.admin(`select consumed_at from public.qr_tokens where token = $1`, [
        minted.token,
      ]),
    );
    assert.equal(
      t.consumed_at,
      null,
      'a mistaken scan must not cost the other person their live code',
    );
  });

  test('the existing connection is untouched', async () => {
    const r = row<{ n: number; field_count: number }>(
      await db.admin(
        `select count(*)::int as n,
                max(coalesce(array_length(fields_at_exchange, 1), 0)) as field_count
           from public.connections where owner_id = '${bob}'`,
      ),
    );
    assert.equal(Number(r.n), 1, 'still exactly one row, not a duplicate');
    assert.equal(
      Number(r.field_count),
      17,
      'a repeat tap must not rewrite the record of what was shared that day',
    );
  });

  test('the same is true on the UWB path', async () => {
    const result = row<{ status: string; exchange_id: string | null }>(
      await db.as(bob, `select * from public.open_uwb_exchange($1)`, [alice]),
    );
    assert.equal(result.status, 'already_connected');
    assert.equal(result.exchange_id, null);
  });

  test('but a genuine stranger still opens normally', async () => {
    const sam = await db.createUser('sam', 'Sam', 'Stranger');
    const minted = row<{ token: string }>(
      await db.as(sam, `select * from public.mint_qr_token(120)`),
    );
    const result = row<{ status: string; exchange_id: string | null }>(
      await db.as(bob, `select * from public.open_qr_exchange($1)`, [minted.token]),
    );

    assert.equal(result.status, 'opened');
    assert.ok(result.exchange_id, 'a real handshake carries an exchange id');
  });
});
