import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDuration,
  totalHours,
  fireAt,
  describeDuration,
} from '../src/reminders.ts';

describe('reminder duration bounds', () => {
  test('zero days and zero hours is rejected', () => {
    const result = validateDuration({ days: 0, hours: 0 });
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /at least 1 hour/);
  });

  test('one hour is the floor and is allowed', () => {
    assert.deepEqual(validateDuration({ days: 0, hours: 1 }), { ok: true, totalHours: 1 });
  });

  test('seven days is the ceiling and is allowed', () => {
    assert.deepEqual(validateDuration({ days: 7, hours: 0 }), { ok: true, totalHours: 168 });
  });

  test('seven days and one hour is rejected', () => {
    const result = validateDuration({ days: 7, hours: 1 });
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /at most 7 days/);
  });

  test('more than 23 hours belongs in the days field', () => {
    const result = validateDuration({ days: 0, hours: 30 });
    assert.equal(result.ok, false);
    assert.match((result as { reason: string }).reason, /days field/);
  });

  test('negative values are rejected', () => {
    assert.equal(validateDuration({ days: -1, hours: 2 }).ok, false);
    assert.equal(validateDuration({ days: 1, hours: -2 }).ok, false);
  });

  test('fractional values are rejected', () => {
    assert.equal(validateDuration({ days: 0.5, hours: 0 }).ok, false);
  });

  test('a mixed duration totals correctly', () => {
    assert.equal(totalHours({ days: 2, hours: 3 }), 51);
  });
});

describe('fire time', () => {
  test('is the duration added to now', () => {
    const from = new Date('2026-09-22T10:00:00Z');
    assert.equal(
      fireAt({ days: 1, hours: 2 }, from).toISOString(),
      '2026-09-23T12:00:00.000Z',
    );
  });
});

describe('describing a duration', () => {
  test('singular and plural read correctly', () => {
    assert.equal(describeDuration({ days: 1, hours: 1 }), '1 day 1 hour');
    assert.equal(describeDuration({ days: 2, hours: 3 }), '2 days 3 hours');
  });

  test('a zero part is omitted', () => {
    assert.equal(describeDuration({ days: 0, hours: 5 }), '5 hours');
    assert.equal(describeDuration({ days: 4, hours: 0 }), '4 days');
  });
});
