import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONNECT_TOKEN_TTL_SECONDS,
  CONNECT_TOKEN_REFRESH_SECONDS,
  CONFIRMATION_TIMEOUT_MS,
  TAP_DISTANCE_METRES,
  isTap,
  confirmationTimeLeftMs,
} from '../src/connect.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (file: string) =>
  readFileSync(join(repoRoot, 'supabase', 'migrations', file), 'utf8');

describe('connect token lifetime', () => {
  // Drift guard, same idea as the field registry one: the database holds the
  // real TTL, and a client that assumes a different one will mint codes that
  // die early or linger.
  test('matches the default on mint_connect_token()', () => {
    const sql = read('0002_rls_and_functions.sql');
    const match = sql.match(
      /function public\.mint_connect_token\(p_ttl_seconds integer default (\d+)\)/,
    );
    assert.ok(match, 'could not find mint_connect_token in the migration');
    assert.equal(Number(match[1]), CONNECT_TOKEN_TTL_SECONDS);
  });

  test('the refresh interval lands before the token expires', () => {
    assert.ok(
      CONNECT_TOKEN_REFRESH_SECONDS < CONNECT_TOKEN_TTL_SECONDS,
      'a screen left open would otherwise broadcast a dead token',
    );
  });

  test('the TTL is inside the range the database will accept', () => {
    const sql = read('0002_rls_and_functions.sql');
    const match = sql.match(/p_ttl_seconds < (\d+) or p_ttl_seconds > (\d+)/);
    assert.ok(match, 'could not find the ttl bounds check');
    assert.ok(CONNECT_TOKEN_TTL_SECONDS >= Number(match[1]));
    assert.ok(CONNECT_TOKEN_TTL_SECONDS <= Number(match[2]));
  });
});

describe('the confirmation window', () => {
  test('matches the 30 seconds the database allows', () => {
    const sql = read('0002_rls_and_functions.sql');
    assert.match(
      sql,
      /now\(\) \+ interval '30 seconds'/,
      'the exchange window in SQL must match CONFIRMATION_TIMEOUT_MS',
    );
    assert.equal(CONFIRMATION_TIMEOUT_MS, 30_000);
  });

  test('counts down from when the exchange opened', () => {
    const openedAt = new Date('2026-09-23T12:00:00Z');
    const now = new Date('2026-09-23T12:00:10Z');
    assert.equal(confirmationTimeLeftMs(openedAt, now), 20_000);
  });

  test('never goes negative', () => {
    const openedAt = new Date('2026-09-23T12:00:00Z');
    const now = new Date('2026-09-23T12:05:00Z');
    assert.equal(confirmationTimeLeftMs(openedAt, now), 0);
  });
});

describe('deciding that two phones touched', () => {
  test('close enough and held long enough counts', () => {
    assert.equal(isTap(0.05, 600), true);
  });

  test('close but only in passing does not', () => {
    // Ranging is noisy and people wave phones around. Without the dwell
    // requirement, walking past someone would raise a prompt.
    assert.equal(isTap(0.05, 100), false);
  });

  test('held but not close does not', () => {
    assert.equal(isTap(0.8, 5000), false);
  });

  test('no reading at all does not', () => {
    // Distance is null while a session is suspended or the peer is lost.
    assert.equal(isTap(null, 5000), false);
  });

  test('the boundary itself counts', () => {
    assert.equal(isTap(TAP_DISTANCE_METRES, 500), true);
  });
});
