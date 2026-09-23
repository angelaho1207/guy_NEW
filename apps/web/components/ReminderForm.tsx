'use client';

import { useActionState } from 'react';
import { setReminder, clearReminder } from '@/app/actions';
import {
  validateDuration,
  describeDuration,
  MAX_DAYS,
  MAX_HOURS,
} from '@guy/shared';
import { useState } from 'react';

type Existing = {
  days: number;
  hours: number;
  fire_at: string;
  fired_at: string | null;
  done_at: string | null;
} | null;

/**
 * One reminder per connection, one time only, between an hour and a week out.
 *
 * The bounds are checked here so the button can explain itself, and again by
 * the database, which is what actually enforces them. The two rules come from
 * the same place: `validateDuration` mirrors the CHECK constraints.
 */
export function ReminderForm({
  connectionId,
  existing,
}: {
  connectionId: string;
  existing: Existing;
}) {
  const [state, action, pending] = useActionState(setReminder, null);
  const [days, setDays] = useState(existing?.days ?? 1);
  const [hours, setHours] = useState(existing?.hours ?? 0);

  const check = validateDuration({ days, hours });
  const live = existing && !existing.done_at;

  return (
    <div className="card">
      <div className="row-head" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Follow-up reminder</h3>
        {live &&
          (existing.fired_at ? (
            <span className="pill" data-tone="accent">
              Fired, not done
            </span>
          ) : (
            <span className="pill">
              {new Date(existing.fire_at).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          ))}
      </div>

      {existing?.done_at && (
        <p className="tiny" style={{ marginTop: 0 }}>
          Marked done. Setting a new one starts fresh.
        </p>
      )}

      <form action={action}>
        <input type="hidden" name="connection_id" value={connectionId} />

        <div className="grid-2">
          <label className="field">
            <span className="field-label">Days</span>
            <input
              type="number"
              name="days"
              min={0}
              max={MAX_DAYS}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="field-label">Hours</span>
            <input
              type="number"
              name="hours"
              min={0}
              max={MAX_HOURS}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </label>
        </div>

        <p className="tiny" style={{ marginTop: 0 }}>
          {check.ok
            ? `Remind me in ${describeDuration({ days, hours })}.`
            : check.reason}
        </p>

        {state && 'error' in state && state.error && (
          <p className="tiny" style={{ color: 'var(--danger)' }}>
            {state.error}
          </p>
        )}

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" disabled={!check.ok || pending}>
            {live ? 'Update reminder' : 'Set reminder'}
          </button>
        </div>
      </form>

      {existing && (
        <form action={clearReminder} style={{ marginTop: 8 }}>
          <input type="hidden" name="connection_id" value={connectionId} />
          <button className="btn btn-quiet btn-sm btn-danger">Remove reminder</button>
        </form>
      )}
    </div>
  );
}
