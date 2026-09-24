import {
  GROUP_ORDER,
  GROUP_LABELS,
  fieldsInGroup,
  isHandleField,
  linkFor,
  displayHandle,
  EMPTY_SHARED_VALUE,
  type ProfileField,
} from '@guy/shared';

export type ContactCard = Partial<Record<ProfileField, string>>;

/**
 * Someone else's details, as the database chose to show them.
 *
 * Two states look similar and mean very different things, so they are drawn
 * differently on purpose:
 *
 *   "-"      they are sharing this field and left it blank
 *   absent   they are not sharing this field, so it is not rendered at all
 *
 * Nothing here filters. Whatever arrived is what they are sharing right now.
 */
export function Card({ card }: { card: ContactCard }) {
  const shown = GROUP_ORDER.map((group) => ({
    group,
    fields: fieldsInGroup(group).filter((f) => card[f.key] !== undefined),
  })).filter((g) => g.fields.length > 0);

  if (shown.length === 0) {
    return (
      <p className="muted">
        They are not currently sharing any of their profile.
      </p>
    );
  }

  return (
    <>
      {shown.map(({ group, fields }) => (
        <section key={group}>
          <p className="eyebrow">{GROUP_LABELS[group]}</p>
          <dl className="card">
            {fields.map((f) => (
              <div className="detail" key={f.key}>
                <dt>{f.label}</dt>
                <dd>
                  <Value field={f.key} card={card} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}

function Value({ field, card }: { field: ProfileField; card: ContactCard }) {
  const raw = card[field];

  if (raw === undefined) return null;
  if (raw === EMPTY_SHARED_VALUE) {
    return <span className="blank" title="Shared, but they left it blank">—</span>;
  }

  if (isHandleField(field)) {
    const href = linkFor(field, raw);
    const text = displayHandle(field, raw);

    // No link is deliberate, not a bug. A Discord username with no numeric id
    // cannot be resolved to a profile, so it renders as text rather than as a
    // link that goes nowhere.
    if (!href) return <>{text}</>;

    return (
      <a
        className="handle-link"
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel="noreferrer"
      >
        {text}
      </a>
    );
  }

  return <>{raw}</>;
}

/** First initials, for the avatar circle. */
export function initials(card: ContactCard, fallback = '?') {
  const first = card.first_name;
  const last = card.last_name;
  const a = first && first !== EMPTY_SHARED_VALUE ? first[0] : '';
  const b = last && last !== EMPTY_SHARED_VALUE ? last[0] : '';
  return (a + b).toUpperCase() || fallback;
}

/** What to call them, falling back when either half of the name is withheld. */
export function cardName(card: ContactCard, username?: string) {
  const first = card.first_name;
  const last = card.last_name;
  if (
    first &&
    last &&
    first !== EMPTY_SHARED_VALUE &&
    last !== EMPTY_SHARED_VALUE
  ) {
    return `${first} ${last}`;
  }
  return username ? `@${username}` : 'Someone';
}
