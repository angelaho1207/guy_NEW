// Draining push_outbox.
//
// The outbox has been filling since 0003 with nothing reading it, so every one
// of these behaviours is new and none of it has ever run in anger. What matters
// most is the part a test can actually hold: that a signed-in person can turn
// notifications on for their own device and nothing else, that the worker's
// functions are reachable by no client at all, and that a message is neither
// dropped on the floor nor retried forever.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, row, rows, type Db } from './harness.ts';

let db: Db;
let alice: string;
let bob: string;

const SUB = {
  endpoint: 'https://push.example/one',
  p256dh: 'BPublicKeyBytesBase64Url',
  auth: 'AuthSecretBase64Url',
};

/** Queues a message the way fire_due_reminders() does. */
const queue = (uid: string, title = 'Follow up', body = 'with Marcus') =>
  db.admin(
    `insert into public.push_outbox (user_id, title, body, data)
     values ($1, $2, $3, jsonb_build_object('url', '/follow-ups'))`,
    [uid, title, body],
  );

before(async () => {
  db = await boot();
  alice = await db.createUser('alice', 'Alice', 'Alvarez');
  bob = await db.createUser('bob', 'Bob', 'Birch');
});

after(async () => {
  await db.close();
});

describe('turning notifications on', () => {
  test('a person can register their own device', async () => {
    await db.as(alice, `select public.register_push_token($1, 'web', $2, $3)`, [
      SUB.endpoint,
      SUB.p256dh,
      SUB.auth,
    ]);

    const saved = row<{ user_id: string; platform: string }>(
      await db.admin(`select user_id, platform from public.push_tokens where token = $1`, [
        SUB.endpoint,
      ]),
    );
    assert.equal(saved.user_id, alice);
    assert.equal(saved.platform, 'web');
  });

  test('registering the same endpoint twice does not duplicate it', async () => {
    // A browser hands back the same endpoint when permission is re-granted, and
    // two rows would mean two copies of every notification on one device.
    await db.as(alice, `select public.register_push_token($1, 'web', $2, $3)`, [
      SUB.endpoint,
      SUB.p256dh,
      SUB.auth,
    ]);

    const { n } = row<{ n: number }>(
      await db.admin(`select count(*)::int as n from public.push_tokens where token = $1`, [
        SUB.endpoint,
      ]),
    );
    assert.equal(Number(n), 1);
  });

  test('a web subscription without its keys is refused', async () => {
    // Undeliverable: encrypting a web push needs all three values. Without the
    // constraint it would sit in the outbox failing until it ran out of
    // attempts, which looks like a broken worker rather than a bad row.
    const err = await db.asExpectingFailure(
      alice,
      `select public.register_push_token('https://push.example/nokeys', 'web', null, null)`,
    );
    assert.match(err, /push_tokens_web_has_keys|violates check/i);
  });

  test('an unknown platform is refused', async () => {
    const err = await db.asExpectingFailure(
      alice,
      `select public.register_push_token('https://push.example/x', 'carrier-pigeon', 'a', 'b')`,
    );
    assert.match(err, /unknown platform/i);
  });

  test('turning it off removes only your own device', async () => {
    await db.as(bob, `select public.register_push_token($1, 'web', 'k', 'a')`, [
      'https://push.example/bob',
    ]);

    // Alice asks to forget Bob's endpoint. Nothing happens.
    await db.as(alice, `select public.forget_push_token($1)`, ['https://push.example/bob']);

    const { n } = row<{ n: number }>(
      await db.admin(`select count(*)::int as n from public.push_tokens where token = $1`, [
        'https://push.example/bob',
      ]),
    );
    assert.equal(Number(n), 1, "one person cannot unsubscribe another's device");

    await db.as(bob, `select public.forget_push_token($1)`, ['https://push.example/bob']);
    const after = row<{ n: number }>(
      await db.admin(`select count(*)::int as n from public.push_tokens where token = $1`, [
        'https://push.example/bob',
      ]),
    );
    assert.equal(Number(after.n), 0, 'but they can unsubscribe their own');
  });
});

describe('what a client cannot do', () => {
  // The worker reads other people's notification text. These are the guards
  // that stop a signed-in person being able to.
  const forbidden = [
    `select * from public.claim_push_batch(10)`,
    `select public.mark_push_sent(array[]::uuid[])`,
    `select public.mark_push_failed(array[]::uuid[], 'x')`,
    `select public.drop_push_subscription('https://push.example/one')`,
    `select public.notify_push_worker()`,
  ];

  for (const sql of forbidden) {
    const name = /public\.(\w+)/.exec(sql)![1];
    test(`authenticated cannot call ${name}`, async () => {
      const err = await db.asExpectingFailure(alice, sql);
      assert.match(err, /permission denied/i);
    });

    test(`anon cannot call ${name}`, async () => {
      const err = await db.asAnonExpectingFailure(sql);
      assert.match(err, /permission denied/i);
    });
  }

  test('nobody can read the outbox directly', async () => {
    const err = await db.asExpectingFailure(alice, `select * from public.push_outbox`);
    assert.match(err, /permission denied/i);
  });

  test('nobody can read where the worker lives', async () => {
    // It holds the shared secret.
    const err = await db.asExpectingFailure(alice, `select * from public.worker_config`);
    assert.match(err, /permission denied/i);
  });
});

describe('draining', () => {
  test('a queued message comes back with the subscription to send it to', async () => {
    await db.admin(`delete from public.push_outbox`);
    await db.as(alice, `select public.register_push_token($1, 'web', $2, $3)`, [
      SUB.endpoint,
      SUB.p256dh,
      SUB.auth,
    ]);
    await queue(alice);

    const batch = rows<{ title: string; endpoint: string; p256dh: string }>(
      await db.admin(`select * from public.claim_push_batch(50)`),
    );
    assert.equal(batch.length, 1);
    assert.equal(batch[0].title, 'Follow up');
    assert.equal(batch[0].endpoint, SUB.endpoint);
    assert.equal(batch[0].p256dh, SUB.p256dh);
  });

  test('claiming counts the attempt, so a crash cannot retry forever', async () => {
    const { attempts } = row<{ attempts: number }>(
      await db.admin(`select attempts from public.push_outbox limit 1`),
    );
    assert.equal(Number(attempts), 1, 'the attempt is counted on the way out');
  });

  test('a message past its attempt limit is left alone', async () => {
    await db.admin(
      `update public.push_outbox set attempts = public.push_max_attempts()`,
    );
    const batch = rows(await db.admin(`select * from public.claim_push_batch(50)`));
    assert.equal(batch.length, 0);
  });

  test('marking sent takes it out of the queue for good', async () => {
    await db.admin(`delete from public.push_outbox`);
    await queue(alice);

    const batch = rows<{ outbox_id: string }>(
      await db.admin(`select * from public.claim_push_batch(50)`),
    );
    await db.admin(`select public.mark_push_sent(array[$1]::uuid[])`, [batch[0].outbox_id]);

    const again = rows(await db.admin(`select * from public.claim_push_batch(50)`));
    assert.equal(again.length, 0);
  });

  test('marking failed keeps the reason without resending', async () => {
    await db.admin(`delete from public.push_outbox`);
    await queue(alice);
    const batch = rows<{ outbox_id: string }>(
      await db.admin(`select * from public.claim_push_batch(50)`),
    );
    await db.admin(`select public.mark_push_failed(array[$1]::uuid[], 'push service said no')`, [
      batch[0].outbox_id,
    ]);

    const stored = row<{ sent_at: unknown; last_error: string; attempts: number }>(
      await db.admin(`select sent_at, last_error, attempts from public.push_outbox`),
    );
    assert.equal(stored.sent_at, null, 'still unsent');
    assert.match(stored.last_error, /said no/);
    assert.equal(Number(stored.attempts), 1, 'and the attempt was counted once, not twice');
  });

  test('a message for someone with no subscription is not claimed', async () => {
    // Nothing to send it to. It should wait rather than burn its attempts.
    await db.admin(`delete from public.push_outbox`);
    await db.admin(`delete from public.push_tokens`);
    await queue(alice);

    const batch = rows(await db.admin(`select * from public.claim_push_batch(50)`));
    assert.equal(batch.length, 0);
  });

  test('a dead subscription can be dropped by endpoint', async () => {
    // What the worker does with a 404 or 410 from the push service: keeping it
    // would mean every future notification for that person failing too.
    await db.as(alice, `select public.register_push_token($1, 'web', 'k', 'a')`, [
      'https://push.example/gone',
    ]);
    const dropped = row<{ drop_push_subscription: number }>(
      await db.admin(`select public.drop_push_subscription('https://push.example/gone')`),
    );
    assert.equal(Number(dropped.drop_push_subscription), 1);
  });
});

describe('poking the worker', () => {
  test('an empty outbox makes no request at all', async () => {
    // 1,440 requests a day for nothing would be rude on a free tier and would
    // make the logs useless.
    await db.admin(`delete from public.push_outbox; delete from net.sent;`);
    await db.admin(`select public.notify_push_worker()`);

    const { n } = row<{ n: number }>(await db.admin(`select count(*)::int as n from net.sent`));
    assert.equal(Number(n), 0);
  });

  test('an unconfigured worker is silent rather than an error', async () => {
    // The config row is inserted by hand after a deploy. A migration that ran
    // before that is not a failure.
    await db.admin(`delete from public.worker_config; delete from net.sent;`);
    await queue(alice);
    await db.admin(`select public.notify_push_worker()`);

    const { n } = row<{ n: number }>(await db.admin(`select count(*)::int as n from net.sent`));
    assert.equal(Number(n), 0);
  });

  test('a waiting message pokes the configured worker, with the secret', async () => {
    await db.admin(`delete from net.sent`);
    await db.admin(
      `insert into public.worker_config (url, secret) values ($1, $2)
         on conflict (id) do update set url = excluded.url, secret = excluded.secret`,
      ['https://guy.example/api/push/drain', 'shhh'],
    );
    await db.admin(`select public.notify_push_worker()`);

    const sent = row<{ url: string; headers: Record<string, string> }>(
      await db.admin(`select url, headers from net.sent order by id desc limit 1`),
    );
    assert.equal(sent.url, 'https://guy.example/api/push/drain');
    assert.equal(sent.headers['X-Worker-Secret'], 'shhh');
  });

  test('the job is scheduled every minute', async () => {
    const job = row<{ schedule: string }>(
      await db.admin(`select schedule from cron.job where jobname = 'guy-notify-push-worker'`),
    );
    assert.equal(job.schedule, '* * * * *');
  });
});
