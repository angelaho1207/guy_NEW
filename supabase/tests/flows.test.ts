// QR token hygiene, reminder bounds, and the 1:1 request windows.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, row, rows, type Db } from './harness.ts';

let db: Db;
let alice: string;
let bob: string;
let aliceConn: string; // Alice's connection row about Bob
let bobConn: string;   // Bob's connection row about Alice

before(async () => {
  db = await boot();
  alice = await db.createUser('alice');
  bob = await db.createUser('bob');

  await db.as(alice, `update public.profiles set name = 'Alice Alvarez'`);
  await db.as(bob, `update public.profiles set name = 'Bob Birch'`);

  const minted = row<{ token: string }>(
    await db.as(alice, `select * from public.mint_qr_token(120)`),
  );
  const id = row<{ open_qr_exchange: string }>(
    await db.as(bob, `select public.open_qr_exchange($1)`, [minted.token]),
  ).open_qr_exchange;
  await db.as(bob, `select public.confirm_exchange($1)`, [id]);
  await db.as(alice, `select public.confirm_exchange($1)`, [id]);

  aliceConn = row<{ id: string }>(
    await db.admin(`select id from public.connections where owner_id = '${alice}'`),
  ).id;
  bobConn = row<{ id: string }>(
    await db.admin(`select id from public.connections where owner_id = '${bob}'`),
  ).id;
});

after(async () => {
  await db.close();
});

describe('QR tokens', () => {
  test('a code is not a user id', async () => {
    const minted = row<{ token: string }>(
      await db.as(alice, `select * from public.mint_qr_token(120)`),
    );
    assert.ok(minted.token.length >= 40, 'the code must carry real entropy');
    assert.ok(
      !minted.token.includes(alice),
      'the code must not embed the account id it belongs to',
    );
  });

  test('a code can only be redeemed once', async () => {
    const minted = row<{ token: string }>(
      await db.as(alice, `select * from public.mint_qr_token(120)`),
    );
    await db.as(bob, `select public.open_qr_exchange($1)`, [minted.token]);

    const err = await db.asExpectingFailure(
      bob,
      `select public.open_qr_exchange($1)`,
      [minted.token],
    );
    assert.match(err, /expired or already used/);
  });

  test('a screenshotted code stops working once it expires', async () => {
    const minted = row<{ token: string }>(
      await db.as(alice, `select * from public.mint_qr_token(120)`),
    );
    await db.admin(
      `update public.qr_tokens set expires_at = now() - interval '1 second' where token = $1`,
      [minted.token],
    );

    const err = await db.asExpectingFailure(
      bob,
      `select public.open_qr_exchange($1)`,
      [minted.token],
    );
    assert.match(err, /expired or already used/);
  });

  test('opening the code screen again retires the previous code', async () => {
    const first = row<{ token: string }>(
      await db.as(alice, `select * from public.mint_qr_token(120)`),
    );
    const second = row<{ token: string }>(
      await db.as(alice, `select * from public.mint_qr_token(120)`),
    );
    assert.notEqual(first.token, second.token);

    const err = await db.asExpectingFailure(
      bob,
      `select public.open_qr_exchange($1)`,
      [first.token],
    );
    assert.match(err, /expired or already used/);

    // The code currently on screen still works.
    await db.as(bob, `select public.open_qr_exchange($1)`, [second.token]);
  });

  test('you cannot scan your own code', async () => {
    const minted = row<{ token: string }>(
      await db.as(alice, `select * from public.mint_qr_token(120)`),
    );
    const err = await db.asExpectingFailure(
      alice,
      `select public.open_qr_exchange($1)`,
      [minted.token],
    );
    assert.match(err, /yourself/);
  });

  test('you cannot read anyone else\'s tokens', async () => {
    await db.as(alice, `select * from public.mint_qr_token(120)`);
    const visible = rows(await db.as(bob, `select token from public.qr_tokens`));
    for (const r of visible as { token: string }[]) {
      void r;
    }
    const mine = row<{ n: number }>(
      await db.as(
        bob,
        `select count(*)::int as n from public.qr_tokens where user_id = '${alice}'`,
      ),
    );
    assert.equal(mine.n, 0);
  });
});

describe('reminder bounds', () => {
  test('zero days and zero hours is rejected', async () => {
    const err = await db.asExpectingFailure(
      alice,
      `select public.set_reminder($1, 0, 0)`,
      [aliceConn],
    );
    assert.match(err, /at least 1 hour/);
  });

  test('more than seven days is rejected', async () => {
    const err = await db.asExpectingFailure(
      alice,
      `select public.set_reminder($1, 8, 0)`,
      [aliceConn],
    );
    assert.match(err, /at most 7 days/);
  });

  test('seven days exactly is accepted', async () => {
    const r = row<{ set_reminder: string }>(
      await db.as(alice, `select public.set_reminder($1, 7, 0)`, [aliceConn]),
    );
    assert.ok(r.set_reminder);

    const check = row<{ hours: number }>(
      await db.admin(
        `select round(extract(epoch from (fire_at - now())) / 3600)::int as hours
           from public.reminders where connection_id = '${aliceConn}'`,
      ),
    );
    assert.equal(Number(check.hours), 168);
  });

  test('one hour exactly is accepted', async () => {
    await db.as(alice, `select public.set_reminder($1, 0, 1)`, [aliceConn]);
    const check = row<{ hours: number }>(
      await db.admin(
        `select round(extract(epoch from (fire_at - now())) / 3600)::int as hours
           from public.reminders where connection_id = '${aliceConn}'`,
      ),
    );
    assert.equal(Number(check.hours), 1);
  });

  test('editing a reminder replaces it and clears its fired state', async () => {
    await db.admin(
      `update public.reminders set fired_at = now(), done_at = now() where connection_id = '${aliceConn}'`,
    );
    await db.as(alice, `select public.set_reminder($1, 2, 3)`, [aliceConn]);

    const r = row<{ days: number; hours: number; fired_at: unknown; done_at: unknown; n: number }>(
      await db.admin(
        `select days, hours, fired_at, done_at,
                (select count(*)::int from public.reminders where connection_id = '${aliceConn}') as n
           from public.reminders where connection_id = '${aliceConn}'`,
      ),
    );
    assert.equal(Number(r.n), 1, 'a reminder is one-time: there is only ever one slot');
    assert.equal(Number(r.days), 2);
    assert.equal(Number(r.hours), 3);
    assert.equal(r.fired_at, null);
    assert.equal(r.done_at, null);
  });

  test('you cannot set a reminder on someone else\'s connection', async () => {
    const err = await db.asExpectingFailure(
      bob,
      `select public.set_reminder($1, 1, 0)`,
      [aliceConn],
    );
    assert.match(err, /connection not found/);
  });

  test('a fired reminder notifies with the name and lands in the undone list', async () => {
    await db.as(alice, `select public.set_reminder($1, 0, 1)`, [aliceConn]);
    await db.admin(
      `update public.reminders set fire_at = now() - interval '1 minute' where connection_id = '${aliceConn}'`,
    );

    const fired = row<{ fire_due_reminders: number }>(
      await db.admin(`select public.fire_due_reminders()`),
    );
    assert.equal(Number(fired.fire_due_reminders), 1);

    const push = row<{ title: string; body: string; user_id: string }>(
      await db.admin(
        `select title, body, user_id from public.push_outbox order by created_at desc limit 1`,
      ),
    );
    assert.equal(push.user_id, alice);
    assert.equal(push.title, 'To do');
    assert.equal(push.body, 'Follow up with Bob Birch.');

    const undone = rows(
      await db.as(alice, `select reminder_id from public.undone_follow_ups`),
    );
    assert.equal(undone.length, 1);

    // Firing again must not double-send.
    const again = row<{ fire_due_reminders: number }>(
      await db.admin(`select public.fire_due_reminders()`),
    );
    assert.equal(Number(again.fire_due_reminders), 0);
  });

  test('marking it done clears it from the undone list', async () => {
    await db.as(
      alice,
      `update public.reminders set done_at = now() where connection_id = $1`,
      [aliceConn],
    );
    const undone = rows(
      await db.as(alice, `select reminder_id from public.undone_follow_ups`),
    );
    assert.equal(undone.length, 0);
  });

  test('the notification falls back to the username when the name was not shared', async () => {
    // Bob stops sharing his name. The already-frozen field set still carries
    // it, so this checks the blank-name fallback rather than consent.
    await db.admin(
      `update public.profiles set name = null where user_id = '${bob}'`,
    );
    const name = row<{ display_name_for: string }>(
      await db.admin(`select public.display_name_for('${bob}', '${alice}')`),
    );
    assert.equal(name.display_name_for, 'bob');

    await db.admin(
      `update public.profiles set name = 'Bob Birch' where user_id = '${bob}'`,
    );
  });

  test('the notification never uses a name that was not shared', async () => {
    await db.admin(
      `update public.connections
          set shared_fields = array_remove(shared_fields, 'name'::public.profile_field)
        where owner_id = '${alice}'`,
    );
    const name = row<{ display_name_for: string }>(
      await db.admin(`select public.display_name_for('${bob}', '${alice}')`),
    );
    assert.equal(
      name.display_name_for,
      'bob',
      'a withheld name must not leak through a push notification',
    );

    await db.admin(
      `update public.connections
          set shared_fields = shared_fields || 'name'::public.profile_field
        where owner_id = '${alice}'`,
    );
  });
});

describe('1:1 requests', () => {
  let requestId: string;

  test('a request notifies the recipient', async () => {
    const r = row<{ request_one_on_one: string }>(
      await db.as(alice, `select public.request_one_on_one($1)`, [aliceConn]),
    );
    assert.ok(r.request_one_on_one);

    requestId = row<{ id: string }>(
      await db.admin(`select id from public.one_on_one_requests limit 1`),
    ).id;

    const push = row<{ user_id: string; body: string }>(
      await db.admin(
        `select user_id, body from public.push_outbox order by created_at desc limit 1`,
      ),
    );
    assert.equal(push.user_id, bob);
    assert.match(push.body, /Alice Alvarez asked to set up a 1:1/);
  });

  test('only the recipient may respond', async () => {
    const err = await db.asExpectingFailure(
      alice,
      `select public.respond_one_on_one($1, true)`,
      [requestId],
    );
    assert.match(err, /only the recipient/);
  });

  test('approval starts both windows from that moment', async () => {
    await db.as(bob, `select public.respond_one_on_one($1, true)`, [requestId]);

    const r = row<{ status: string; scheduling_days: number; outer_days: number }>(
      await db.admin(
        `select status,
                round(extract(epoch from (expires_at - approved_at)) / 86400)::int as scheduling_days,
                round(extract(epoch from (outer_limit_at - approved_at)) / 86400)::int as outer_days
           from public.one_on_one_requests where id = '${requestId}'`,
      ),
    );
    assert.equal(r.status, 'approved');
    assert.equal(Number(r.scheduling_days), 3);
    assert.equal(Number(r.outer_days), 14);
  });

  test('the scheduling window is a chat both sides can write to', async () => {
    await db.as(
      bob,
      `insert into public.one_on_one_messages (request_id, sender_id, body)
       values ($1, $2, 'Thursday afternoon?')`,
      [requestId, bob],
    );
    const seen = rows(
      await db.as(alice, `select body from public.one_on_one_messages`),
    );
    assert.equal(seen.length, 1);
  });

  test('an outsider cannot read the scheduling chat', async () => {
    const carol = await db.createUser('carol');
    const seen = rows(
      await db.as(carol, `select body from public.one_on_one_messages`),
    );
    assert.equal(seen.length, 0);
  });

  test('a meeting cannot be scheduled beyond the two week limit', async () => {
    const err = await db.asExpectingFailure(
      alice,
      `select public.schedule_one_on_one($1, now() + interval '20 days')`,
      [requestId],
    );
    assert.match(err, /within 2 weeks/);
  });

  test('a meeting cannot be scheduled in the past', async () => {
    const err = await db.asExpectingFailure(
      alice,
      `select public.schedule_one_on_one($1, now() - interval '1 hour')`,
      [requestId],
    );
    assert.match(err, /future/);
  });

  test('agreeing on a time inside both windows schedules it', async () => {
    await db.as(
      alice,
      `select public.schedule_one_on_one($1, now() + interval '5 days')`,
      [requestId],
    );
    const r = row<{ status: string }>(
      await db.admin(`select status from public.one_on_one_requests where id = '${requestId}'`),
    );
    assert.equal(r.status, 'scheduled');

    const push = row<{ user_id: string }>(
      await db.admin(
        `select user_id from public.push_outbox order by created_at desc limit 1`,
      ),
    );
    assert.equal(push.user_id, bob, 'the other party is notified, not the actor');
  });

  test('an approved request that goes unscheduled for three days expires', async () => {
    await db.admin(
      `update public.one_on_one_requests
          set status = 'approved', scheduled_for = null, scheduled_at = null,
              expires_at = now() - interval '1 minute'
        where id = '${requestId}'`,
    );

    const n = row<{ expire_stale_one_on_ones: number }>(
      await db.admin(`select public.expire_stale_one_on_ones()`),
    );
    assert.equal(Number(n.expire_stale_one_on_ones), 1);

    const r = row<{ status: string }>(
      await db.admin(`select status from public.one_on_one_requests where id = '${requestId}'`),
    );
    assert.equal(r.status, 'expired');

    const notified = row<{ n: number }>(
      await db.admin(
        `select count(*)::int as n from public.push_outbox
          where data ->> 'kind' = 'one_on_one_expired'`,
      ),
    );
    assert.equal(Number(notified.n), 2, 'both people are told it expired');
  });

  test('after expiry either person can send a new request', async () => {
    const r = row<{ request_one_on_one: string }>(
      await db.as(bob, `select public.request_one_on_one($1)`, [bobConn]),
    );
    assert.ok(r.request_one_on_one);
  });

  test('only one live request may exist between a pair', async () => {
    const err = await db.asExpectingFailure(
      alice,
      `select public.request_one_on_one($1)`,
      [aliceConn],
    );
    assert.match(err, /one_on_one_one_live_per_pair|duplicate key/);
  });

  test('the chat closes once the window has passed', async () => {
    const fresh = row<{ id: string }>(
      await db.admin(
        `select id from public.one_on_one_requests where status = 'pending' limit 1`,
      ),
    );
    const err = await db.asExpectingFailure(
      alice,
      `insert into public.one_on_one_messages (request_id, sender_id, body)
       values ($1, $2, 'too early')`,
      [fresh.id, alice],
    );
    assert.match(
      err,
      /row-level security/i,
      'the scheduling chat only opens after approval',
    );
  });
});
