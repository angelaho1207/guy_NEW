import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  windowsFromApproval,
  canPropose,
  schedulingTimeLeftMs,
  chatIsOpen,
} from '../src/oneOnOne.ts';

const approvedAt = new Date('2026-09-22T12:00:00Z');
const windows = windowsFromApproval(approvedAt);

describe('the windows', () => {
  test('both start counting from approval, not from the request', () => {
    assert.equal(windows.expiresAt.toISOString(), '2026-09-25T12:00:00.000Z');
    assert.equal(windows.outerLimitAt.toISOString(), '2026-10-06T12:00:00.000Z');
  });
});

describe('proposing a time', () => {
  const now = new Date('2026-09-23T12:00:00Z'); // one day after approval

  test('a time inside both windows is fine', () => {
    assert.deepEqual(canPropose(new Date('2026-09-30T09:00:00Z'), windows, now), {
      ok: true,
    });
  });

  test('a time past the two week outer limit is refused', () => {
    const result = canPropose(new Date('2026-10-10T09:00:00Z'), windows, now);
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /within 2 weeks/);
  });

  test('a time in the past is refused', () => {
    const result = canPropose(new Date('2026-09-22T09:00:00Z'), windows, now);
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /future/);
  });

  test('nothing can be proposed once the 3 day window has closed', () => {
    const late = new Date('2026-09-26T12:00:00Z');
    const result = canPropose(new Date('2026-09-30T09:00:00Z'), windows, late);
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /3 day scheduling window/);
  });

  test('the outer limit is inclusive of its own boundary', () => {
    assert.deepEqual(canPropose(windows.outerLimitAt, windows, now), { ok: true });
  });
});

describe('time left to agree', () => {
  test('counts down to the 3 day deadline', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    assert.equal(schedulingTimeLeftMs(windows, now), 24 * 60 * 60 * 1000);
  });

  test('never goes negative', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    assert.equal(schedulingTimeLeftMs(windows, now), 0);
  });
});

describe('the scheduling chat', () => {
  const now = new Date('2026-09-23T12:00:00Z');

  test('opens on approval', () => {
    assert.equal(chatIsOpen('approved', windows, now), true);
  });

  test('stays open after a time is agreed, so it can be changed', () => {
    assert.equal(chatIsOpen('scheduled', windows, now), true);
  });

  test('is shut before approval', () => {
    assert.equal(chatIsOpen('pending', windows, now), false);
  });

  test('is shut once the request has expired or been declined', () => {
    assert.equal(chatIsOpen('expired', windows, now), false);
    assert.equal(chatIsOpen('declined', windows, now), false);
  });

  test('is shut once the 3 day window closes, even while approved', () => {
    const late = new Date('2026-09-26T12:00:00Z');
    assert.equal(chatIsOpen('approved', windows, late), false);
  });
});
