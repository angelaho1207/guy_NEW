/**
 * Database dates, on their way into a form value or onto the screen.
 *
 * Two separate traps live here, and both produce wrong answers quietly.
 *
 * **Stringified Dates.** The driver returns `date` and `timestamptz` columns
 * as JavaScript `Date` objects. React puts one into an input value with
 * toString(), producing "Wed Sep 23 2026 04:21:16 GMT-0400 (Eastern Daylight
 * Time)". Postgres rejects that coming back with "time zone gmt-0400 not
 * recognized", and the only symptom is a button that does nothing.
 *
 * **Day-level dates are not instants.** A `date` column has no time zone, and
 * the driver hands it back as midnight UTC. Read that with local getters west
 * of Greenwich and you get the day before: a note written on the 14th reads as
 * the 13th, and saving the form moves it back another day each time. So
 * anything from a `date` column is read and formatted in UTC.
 *
 * `timestamptz` columns are real instants and are shown in local time, which
 * is what the *_at helpers are for.
 */

type Stamp = Date | string | null | undefined;

/** `YYYY-MM-DD` from a `date` column, for an `<input type="date">`. */
export function toDateValue(value: Stamp): string {
  const d = parse(value);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** A `date` column, formatted for reading. Never shifts the day. */
export function formatDate(
  value: Stamp,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
): string {
  const d = parse(value);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
}

/** A `timestamptz`, formatted in the reader's own time zone. */
export function formatInstant(
  value: Stamp,
  options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
): string {
  const d = parse(value);
  if (!d) return '';
  return d.toLocaleString(undefined, options);
}

/** Full ISO, for a hidden field that will be cast back to `timestamptz`. */
export function toInstantValue(value: Stamp): string {
  const d = parse(value);
  return d ? d.toISOString() : '';
}

function parse(value: Stamp): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
