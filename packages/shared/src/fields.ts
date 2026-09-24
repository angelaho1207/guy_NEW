/**
 * The canonical profile field registry.
 *
 * This list mirrors the `public.profile_field` enum in
 * supabase/migrations/0001_init.sql exactly, key for key and order for order.
 * A test asserts that, so the two cannot drift apart silently: if someone adds
 * a field to one and not the other, the suite fails.
 *
 * The database is what actually enforces which fields cross a privacy
 * boundary. This file exists so the UI can label and group them, and so a
 * client can show an honest preview of what it is about to share.
 */

export const PROFILE_FIELDS = [
  // --- Basic info -----------------------------------------------------------
  { key: 'first_name', group: 'basic', label: 'First name' },
  { key: 'last_name', group: 'basic', label: 'Last name' },
  { key: 'school', group: 'basic', label: 'School' },
  { key: 'societies', group: 'basic', label: 'Societies / activities' },
  { key: 'major', group: 'basic', label: 'Major' },
  { key: 'class_year', group: 'basic', label: 'Class year' },
  { key: 'affiliations', group: 'basic', label: 'Affiliations' },
  { key: 'hometown', group: 'basic', label: 'Hometown' },

  // --- Talk to me about -----------------------------------------------------
  { key: 'currently_into', group: 'talk', label: "Things I'm currently into" },
  { key: 'want_to_learn', group: 'talk', label: "Things I'd love to learn more about" },
  { key: 'figuring_out', group: 'talk', label: "Things I'm figuring out" },

  // --- Handles --------------------------------------------------------------
  { key: 'linkedin', group: 'handles', label: 'LinkedIn' },
  { key: 'x', group: 'handles', label: 'X' },
  { key: 'discord', group: 'handles', label: 'Discord' },
  { key: 'instagram', group: 'handles', label: 'Instagram' },
  { key: 'whatsapp', group: 'handles', label: 'WhatsApp' },
  { key: 'messenger', group: 'handles', label: 'Messenger' },
  { key: 'phone', group: 'handles', label: 'Phone' },
  { key: 'work_email', group: 'handles', label: 'Work email' },
  { key: 'personal_email', group: 'handles', label: 'Personal email' },
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number]['key'];
export type FieldGroup = (typeof PROFILE_FIELDS)[number]['group'];

export const FIELD_KEYS: readonly ProfileField[] = PROFILE_FIELDS.map((f) => f.key);

export const GROUP_LABELS: Record<FieldGroup, string> = {
  basic: 'Basic info',
  talk: 'Talk to me about',
  handles: 'Handles',
};

export const GROUP_ORDER: readonly FieldGroup[] = ['basic', 'talk', 'handles'];

export function fieldsInGroup(group: FieldGroup) {
  return PROFILE_FIELDS.filter((f) => f.group === group);
}

export function labelFor(key: ProfileField): string {
  return PROFILE_FIELDS.find((f) => f.key === key)!.label;
}

/**
 * The only profile fields a user must fill in. Everything else is optional.
 *
 * Required is about completeness, not about sharing: both still carry a
 * shareable toggle like any other field, and both can be withheld.
 */
export const REQUIRED_FIELDS = ['first_name', 'last_name'] as const;

export function isRequired(key: ProfileField): boolean {
  return (REQUIRED_FIELDS as readonly string[]).includes(key);
}

/**
 * Full name for display, from a card or a profile.
 *
 * Returns null unless BOTH names are present, because half a name is not a
 * name. Either one can be missing from a card when its owner withheld it, so
 * callers fall back to the username rather than rendering "Alice -".
 */
export function fullName(
  source: Partial<Record<'first_name' | 'last_name', string>>,
): string | null {
  const first = source.first_name?.trim();
  const last = source.last_name?.trim();
  if (!first || !last) return null;
  if (first === EMPTY_SHARED_VALUE || last === EMPTY_SHARED_VALUE) return null;
  return `${first} ${last}`;
}

/**
 * Placeholder copy for the three "talk to me about" boxes.
 *
 * The brief says the real copy will be supplied later and that a reasonable
 * stand-in should be used until then, so these are deliberately easy to swap:
 * they are the only place this text appears.
 */
export const TALK_PLACEHOLDERS: Record<'currently_into' | 'want_to_learn' | 'figuring_out', string> =
  {
    currently_into: 'Short bullets work well — e.g. urban planning, bouldering, Bach',
    want_to_learn: 'Short bullets work well — e.g. how ad auctions work, Portuguese',
    figuring_out: "Short bullets work well — e.g. whether to do a PhD, where to live next year",
  };

/** What a shared-but-empty field renders as, per the brief. */
export const EMPTY_SHARED_VALUE = '-';
