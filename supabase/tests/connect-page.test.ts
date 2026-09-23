// The query behind the connect screen's confirmation prompt.
//
// The prompt has to appear for BOTH people, name whoever is asking, and
// disappear once the window closes. Getting that wrong looks like the bug it
// was written after: an exchange opens, the banner says "confirm below", and
// there is nothing below to press.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boot, row, rows, type Db } from './harness.ts';

let db: Db;
let alice: string;
let bob: string;
let exchangeId: string;

/** Exactly the query apps/web/app/connect/page.tsx runs. */
const PENDING_SQL = `
  select
    e.id,
    e.expires_at,
    case when e.initiator_id = $1 then e.initiator_confirmed_at is not null
         else e.responder_confirmed_at is not null end as you_confirmed,
    public.exchange_peer_name(e.id) as peer_name
  from public.exchanges e
  where e.state = 'pending'
    and e.expires_at > now()
    and (e.initiator_id = $1 or e.responder_id = $1)
  order by e.created_at desc`;

type Pending = { id: string; you_confirmed: boolean; peer_name: string };


before(async () => {
  db = await boot();
  alice = await db.createUser('alice', 'Alice', 'Alvarez');
  bob = await db.createUser('bob', 'Bob', 'Birch');

  const minted = row<{ token: string }>(
    await db.as(alice, `select * from public.mint_connect_token(120)`),
  );
  exchangeId = row<{ exchange_id: string }>(
    await db.as(bob, `select * from public.open_exchange($1, 'qr')`, [minted.token]),
  ).exchange_id;
});

after(async () => {
  await db.close();
});

describe('the confirmation prompt', () => {
  test('appears for the person who scanned', async () => {
    const mine = rows<Pending>(await db.as(bob, PENDING_SQL, [bob]));
    assert.equal(mine.length, 1);
    assert.equal(mine[0].id, exchangeId);
    assert.equal(mine[0].you_confirmed, false);
  });

  test('appears for the person whose code was scanned', async () => {
    // This is the half that matters. They did nothing, so nothing on their
    // screen changes unless the page is asked again.
    const theirs = rows<Pending>(await db.as(alice, PENDING_SQL, [alice]));
    assert.equal(theirs.length, 1);
    assert.equal(theirs[0].id, exchangeId);
  });

  test('names the other person, not yourself', async () => {
    const mine = rows<Pending>(await db.as(bob, PENDING_SQL, [bob]));
    const theirs = rows<Pending>(await db.as(alice, PENDING_SQL, [alice]));

    assert.equal(mine[0].peer_name, 'Alice Alvarez');
    assert.equal(theirs[0].peer_name, 'Bob Birch');
  });

  test('falls back to a username when the name is withheld', async () => {
    await db.as(
      alice,
      `update public.profile_field_shares set shareable = false where field = 'last_name'`,
    );
    const mine = rows<Pending>(await db.as(bob, PENDING_SQL, [bob]));
    assert.equal(mine[0].peer_name, 'alice');

    await db.as(
      alice,
      `update public.profile_field_shares set shareable = true where field = 'last_name'`,
    );
  });

  test('an outsider cannot ask who is in an exchange they are not in', async () => {
    const mallory = await db.createUser('mallory', 'Mal', 'Ory');
    const err = await db.asExpectingFailure(
      mallory,
      `select public.exchange_peer_name($1)`,
      [exchangeId],
    );
    assert.match(err, /not a party/);
  });

  test('does not appear for anyone else', async () => {
    const carol = await db.createUser('carol', 'Carol', 'Chen');
    assert.equal(rows(await db.as(carol, PENDING_SQL, [carol])).length, 0);
  });

  test('shows you have confirmed, while still waiting on them', async () => {
    await db.as(bob, `select public.confirm_exchange($1)`, [exchangeId]);

    const mine = rows<Pending>(await db.as(bob, PENDING_SQL, [bob]));
    const theirs = rows<Pending>(await db.as(alice, PENDING_SQL, [alice]));

    assert.equal(mine[0].you_confirmed, true, 'your side shows as done');
    assert.equal(theirs[0].you_confirmed, false, 'theirs still needs pressing');
  });

  test('disappears once both have confirmed', async () => {
    await db.as(alice, `select public.confirm_exchange($1)`, [exchangeId]);

    assert.equal(rows(await db.as(bob, PENDING_SQL, [bob])).length, 0);
    assert.equal(rows(await db.as(alice, PENDING_SQL, [alice])).length, 0);

    const n = row<{ n: number }>(
      await db.admin(`select count(*)::int as n from public.connections`),
    );
    assert.equal(Number(n.n), 2, 'and the connection exists on both sides');
  });

  test('a timed-out exchange stops being offered', async () => {
    const dana = await db.createUser('dana', 'Dana', 'Doe');
    const minted = row<{ token: string }>(
      await db.as(dana, `select * from public.mint_connect_token(120)`),
    );
    const id = row<{ exchange_id: string }>(
      await db.as(bob, `select * from public.open_exchange($1, 'qr')`, [minted.token]),
    ).exchange_id;

    assert.equal(rows(await db.as(bob, PENDING_SQL, [bob])).length, 1);

    await db.admin(
      `update public.exchanges set expires_at = now() - interval '1 second' where id = '${id}'`,
    );

    assert.equal(
      rows(await db.as(bob, PENDING_SQL, [bob])).length,
      0,
      'a prompt nobody can act on must not sit there looking live',
    );
  });
});
