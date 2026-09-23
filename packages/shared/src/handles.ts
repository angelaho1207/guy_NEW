/**
 * Turning a stored handle into something tappable.
 *
 * Handles are stored bare and the profile URL is constructed from them, so
 * tapping LinkedIn, X or Instagram opens the profile, tapping a phone number
 * opens the dialer, and tapping an email opens the mail client.
 *
 * Discord needs a second value. A username cannot be resolved to a profile
 * link, but the numeric user id can, so the profile collects both: the
 * username is what people recognise, the id is what makes it tappable. The id
 * is not separately shareable; it travels with the username. Pass it to
 * `linkFor` as the third argument. Without it, Discord renders as plain text
 * rather than as a link that goes nowhere.
 */

import type { ProfileField } from './fields.ts';

export type HandleField =
  | 'linkedin'
  | 'x'
  | 'discord'
  | 'instagram'
  | 'phone'
  | 'work_email'
  | 'personal_email';

export const HANDLE_FIELDS: readonly HandleField[] = [
  'linkedin',
  'x',
  'discord',
  'instagram',
  'phone',
  'work_email',
  'personal_email',
];

export function isHandleField(key: ProfileField): key is HandleField {
  return (HANDLE_FIELDS as readonly string[]).includes(key);
}

/** Hosts we strip when someone pastes a full URL instead of a bare handle. */
const PASTE_PREFIXES: Record<string, RegExp[]> = {
  linkedin: [/^https?:\/\/(www\.)?linkedin\.com\/in\//i, /^(www\.)?linkedin\.com\/in\//i],
  x: [
    /^https?:\/\/(www\.)?(x|twitter)\.com\//i,
    /^(www\.)?(x|twitter)\.com\//i,
  ],
  instagram: [
    /^https?:\/\/(www\.)?instagram\.com\//i,
    /^(www\.)?instagram\.com\//i,
  ],
};

/**
 * Cleans up what the user typed into the bare handle we store.
 *
 * People paste whole URLs and type leading @ signs. Normalising on the way in
 * keeps the stored value canonical, so the link built from it is always right.
 */
export function normalizeHandle(field: HandleField, raw: string): string {
  let value = raw.trim();
  if (value === '') return '';

  if (field === 'phone') {
    // Keep a leading +, drop the formatting humans add.
    const plus = value.startsWith('+') ? '+' : '';
    return plus + value.replace(/[^\d]/g, '');
  }

  if (field === 'work_email' || field === 'personal_email') {
    return value.toLowerCase().replace(/^mailto:/i, '');
  }

  for (const pattern of PASTE_PREFIXES[field] ?? []) {
    value = value.replace(pattern, '');
  }
  value = value.replace(/^@+/, '');
  value = value.replace(/[/?#].*$/, ''); // trailing path, query or fragment
  return value.trim();
}

/** A Discord user id is a snowflake: a long run of digits. */
export function isValidDiscordId(id: string | null | undefined): boolean {
  return typeof id === 'string' && /^[0-9]{15,25}$/.test(id.trim());
}

/**
 * The URL a tap should open, or null when this handle is not tappable.
 *
 * Returning null is meaningful: the caller must render plain text rather than
 * inventing a link that goes somewhere wrong. Discord returns null unless a
 * valid numeric id is supplied, since the username alone cannot be resolved.
 */
export function linkFor(
  field: HandleField,
  handle: string,
  discordId?: string | null,
): string | null {
  const value = normalizeHandle(field, handle);
  if (value === '') return null;

  switch (field) {
    case 'linkedin':
      return `https://www.linkedin.com/in/${encodeURIComponent(value)}`;
    case 'x':
      return `https://x.com/${encodeURIComponent(value)}`;
    case 'instagram':
      return `https://instagram.com/${encodeURIComponent(value)}`;
    case 'phone':
      return `tel:${value}`;
    case 'work_email':
    case 'personal_email':
      return `mailto:${value}`;
    case 'discord':
      // The username is what shows; the id is what the tap follows.
      return isValidDiscordId(discordId)
        ? `https://discord.com/users/${discordId!.trim()}`
        : null;
  }
}

/** How the handle reads on screen, as distinct from where it points. */
export function displayHandle(field: HandleField, handle: string): string {
  const value = normalizeHandle(field, handle);
  if (value === '') return '';

  switch (field) {
    case 'linkedin':
    case 'x':
    case 'instagram':
    case 'discord':
      return `@${value}`;
    default:
      return value;
  }
}
