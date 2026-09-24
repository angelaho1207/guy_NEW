/**
 * Turning a stored handle into something tappable.
 *
 * Handles are stored bare and the profile URL is constructed from them, so
 * tapping LinkedIn, X, Instagram or Messenger opens the profile, tapping a
 * phone number opens the dialer, tapping WhatsApp opens a chat, and tapping an
 * email opens the mail client. Nothing here asks anyone to paste a URL: a
 * pasted URL is accepted and reduced back to the handle inside it, because
 * people paste them, but the handle is what is stored and the link is always
 * built from it.
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
  | 'whatsapp'
  | 'messenger'
  | 'phone'
  | 'work_email'
  | 'personal_email';

export const HANDLE_FIELDS: readonly HandleField[] = [
  'linkedin',
  'x',
  'discord',
  'instagram',
  'whatsapp',
  'messenger',
  'phone',
  'work_email',
  'personal_email',
];

export function isHandleField(key: ProfileField): key is HandleField {
  return (HANDLE_FIELDS as readonly string[]).includes(key);
}

/** Hosts we strip when someone pastes a full URL instead of a bare handle. */
const PASTE_PREFIXES: Record<string, RegExp[]> = {
  // LinkedIn is the one field the form asks for a URL rather than a handle,
  // because the slug is not derivable from a name: LinkedIn appends a random
  // suffix when the obvious one is taken, so `angela-ho` and
  // `angela-ho-4289992b2` are both real profiles belonging to different
  // people. The URL is still reduced to its slug on the way in, so what gets
  // stored is a handle like every other field and the link is still built from
  // a fixed template rather than from whatever string was pasted.
  //
  // The optional short subdomain covers the country-specific hosts LinkedIn
  // redirects to (uk., de., m.) as well as www.
  linkedin: [/^(https?:\/\/)?([a-z]{1,3}\.)?linkedin\.com\/in\//i],
  x: [
    /^https?:\/\/(www\.)?(x|twitter)\.com\//i,
    /^(www\.)?(x|twitter)\.com\//i,
  ],
  instagram: [
    /^https?:\/\/(www\.)?instagram\.com\//i,
    /^(www\.)?instagram\.com\//i,
  ],
  messenger: [
    /^https?:\/\/(www\.)?(m\.me|messenger\.com)\/(t\/)?/i,
    /^(www\.)?(m\.me|messenger\.com)\/(t\/)?/i,
    /^https?:\/\/(www\.)?facebook\.com\/(messages\/t\/)?/i,
    /^(www\.)?facebook\.com\/(messages\/t\/)?/i,
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

  if (field === 'phone' || field === 'whatsapp') {
    // Keep a leading +, drop the formatting humans add. A pasted wa.me or
    // api.whatsapp.com link falls out of this too: everything that is not a
    // digit goes, and what is left is the number the link was built from.
    const plus = value.startsWith('+') || /wa\.me|whatsapp/i.test(value) ? '+' : '';
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
    case 'messenger':
      return `https://m.me/${encodeURIComponent(value)}`;
    case 'whatsapp': {
      // wa.me wants digits with a country code and no punctuation. A number
      // typed without a country code cannot be turned into a working link, and
      // there is no way to guess which country it belongs to, so short inputs
      // render as plain text rather than as a link to the wrong person.
      const digits = value.replace(/[^\d]/g, '');
      return digits.length >= 8 ? `https://wa.me/${digits}` : null;
    }
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
    case 'x':
    case 'instagram':
    case 'discord':
    case 'messenger':
      return `@${value}`;
    case 'linkedin':
      // Not an @ handle, and often ends in a random suffix. Showing the path
      // it actually resolves to reads more honestly than dressing it up.
      return `linkedin.com/in/${value}`;
    default:
      return value;
  }
}
