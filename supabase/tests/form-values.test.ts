// Dates that leave the database and come back through a form.
//
// The driver returns `date` and `timestamptz` columns as JavaScript Date
// objects. React stringifies a Date put into an input value with toString(),
// which produces "Wed Sep 23 2026 04:21:16 GMT-0400 (Eastern Daylight Time)".
// Postgres then rejects that on the way back in with "time zone gmt-0400 not
// recognized", and the only symptom is a scheduling button that does nothing.
//
// apps/web/lib/dates.ts exists to stop that. These tests prove both halves:
// that the raw value really is rejected, and that the normalised one is not.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, row, type Db } from './harness.ts';
import { toInstantValue, toDateValue } from '../../apps/web/lib/dates.ts';

let db: Db;
let alice: string;
let bob: string;
let conn: string;
let requestId: string;

before(async () => {
  db = await boot();
  alice = await db.createUser('alice', 'Alice', 'Alvarez');
  bob = await db.createUser('bob', 'Bob', 'Birch');

  const minted = row<{ token: string }>(
    await db.as(alice, `select * from public.mint_connect_token(120)`),
  );
  const ex = row<{ exchange_id: string }>(
    await db.as(bob, `select * from public.open_exchange($1, 'qr')`, [minted.token]),
  );
  await db.as(bob, `select public.confirm_exchange($1)`, [ex.exchange_id]);
  await db.as(alice, `select public.confirm_exchange($1)`, [ex.exchange_id]);

  conn = row<{ id: string }>(
    await db.admin(`select id from public.connections where owner_id = '${alice}'`),
  ).id;

  await db.as(alice, `select public.request_one_on_one($1)`, [conn]);
  requestId = row<{ id: string }>(
    await db.admin(`select id from public.one_on_one_requests limit 1`),
  ).id;
  await db.as(bob, `select public.respond_one_on_one($1, true)`, [requestId]);

  await db.as(
    alice,
    `insert into public.one_on_one_messages (request_id, sender_id, body, proposed_for)
     values ($1, $2, 'how about then?', date_trunc('hour', now() + interval '4 days'))`,
    [requestId, alice],
  );
});

after(async () => {
  await db.close();
});

describe('a proposed time going back to the server', () => {
  const proposed = async () =>
    row<{ proposed_for: unknown }>(
      await db.as(
        bob,
        `select proposed_for from public.one_on_one_messages where request_id = $1`,
        [requestId],
      ),
    ).proposed_for;

  test('the driver hands back a Date, not a string', () => {
    // If this ever changes, the rest of this file is describing a problem that
    // no longer exists, and the helper can go.
    return proposed().then((v) => {
      assert.ok(v instanceof Date, `expected a Date, got ${typeof v}`);
    });
  });

  test('the raw stringified Date is rejected by Postgres', async () => {
    const raw = String(await proposed());
    assert.match(raw, /GMT[+-]\d{4}/, 'this test only means something if it has a zone suffix');

    const err = await db.asExpectingFailure(
      bob,
      `select public.schedule_one_on_one($1, $2::timestamptz)`,
      [requestId, raw],
    );
    assert.match(err, /time zone|invalid input syntax/i);
  });

  test('the normalised value is accepted', async () => {
    const value = toInstantValue((await proposed()) as Date);
    await db.as(bob, `select public.schedule_one_on_one($1, $2::timestamptz)`, [
      requestId,
      value,
    ]);

    const r = row<{ status: string }>(
      await db.admin(
        `select status from public.one_on_one_requests where id = '${requestId}'`,
      ),
    );
    assert.equal(r.status, 'scheduled');
  });

  test('and it survives the round trip to the same instant', async () => {
    const stored = row<{ scheduled_for: Date }>(
      await db.admin(
        `select scheduled_for from public.one_on_one_requests where id = '${requestId}'`,
      ),
    ).scheduled_for;

    assert.equal(
      new Date(stored).getTime(),
      new Date(toInstantValue((await proposed()) as Date)).getTime(),
      'accepting a time must schedule that time, not one an offset away',
    );
  });
});

describe('a "how you met" date going back to the server', () => {
  test('normalises to what an input type=date wants', async () => {
    await db.as(
      alice,
      `update public.connections set how_we_met_on = date '2026-03-14' where id = $1`,
      [conn],
    );
    const stored = row<{ how_we_met_on: Date }>(
      await db.as(
        alice,
        `select how_we_met_on from public.connections where id = $1`,
        [conn],
      ),
    ).how_we_met_on;

    assert.equal(toDateValue(stored), '2026-03-14');
  });

  test('saving it back keeps the same day', async () => {
    // The round trip is the thing that used to lose a day each time: read the
    // stored date, put it in the form, save the form, read it again.
    const stored = row<{ how_we_met_on: Date }>(
      await db.as(
        alice,
        `select how_we_met_on from public.connections where id = $1`,
        [conn],
      ),
    ).how_we_met_on;

    const value = toDateValue(stored);
    await db.as(
      alice,
      `update public.connections set how_we_met_on = $1::date where id = $2`,
      [value, conn],
    );

    const back = row<{ how_we_met_on: Date }>(
      await db.as(
        alice,
        `select how_we_met_on from public.connections where id = $1`,
        [conn],
      ),
    ).how_we_met_on;

    assert.equal(toDateValue(back), '2026-03-14');
  });

  test('an empty value stays empty rather than becoming 1970', () => {
    assert.equal(toDateValue(null), '');
    assert.equal(toDateValue(undefined), '');
    assert.equal(toDateValue(''), '');
    assert.equal(toInstantValue(null), '');
  });
});
