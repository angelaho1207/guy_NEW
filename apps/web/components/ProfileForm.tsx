'use client';

import { useActionState } from 'react';
import { saveProfile } from '@/app/actions';
import { ShareToggle } from './ShareToggle';
import {
  GROUP_ORDER,
  GROUP_LABELS,
  fieldsInGroup,
  isRequired,
  TALK_PLACEHOLDERS,
  type ProfileField,
} from '@guy/shared';

type Profile = Partial<Record<ProfileField | 'discord_id', string | null>>;

const HANDLE_HINTS: Partial<Record<ProfileField, string>> = {
  linkedin: 'https://www.linkedin.com/in/angela-ho-4289992b2',
  x: 'angelaho',
  instagram: 'angela.ho',
  whatsapp: '+1 650 555 0142 — include the country code',
  messenger: 'angela.ho, or paste your m.me link',
  discord: 'angelaho',
  phone: '+1 650 555 0142',
  work_email: 'you@work.com',
  personal_email: 'you@example.com',
};

export function ProfileForm({
  profile,
  shares,
}: {
  profile: Profile;
  shares: Record<string, boolean>;
}) {
  const [state, action, pending] = useActionState(saveProfile, null);

  return (
    <form action={action}>
      {GROUP_ORDER.map((group) => (
        <section key={group}>
          <h2>{GROUP_LABELS[group]}</h2>
          <div className="card">
            {fieldsInGroup(group).map((f) => (
              <div className="field" key={f.key}>
                <div className="field-head">
                  <span className="field-label">
                    {f.label}
                    {isRequired(f.key) && (
                      <span style={{ color: 'var(--accent)' }}> *</span>
                    )}
                  </span>
                  <ShareToggle field={f.key} on={shares[f.key] ?? true} />
                </div>

                {group === 'talk' ? (
                  <textarea
                    name={f.key}
                    defaultValue={profile[f.key] ?? ''}
                    placeholder={
                      TALK_PLACEHOLDERS[
                        f.key as keyof typeof TALK_PLACEHOLDERS
                      ]
                    }
                  />
                ) : (
                  <input
                    type="text"
                    name={f.key}
                    defaultValue={profile[f.key] ?? ''}
                    placeholder={HANDLE_HINTS[f.key] ?? ''}
                  />
                )}

                {f.key === 'linkedin' && (
                  <p className="tiny" style={{ margin: '6px 0 0' }}>
                    Paste the whole URL for this one. LinkedIn adds a few
                    random characters to the end of most profile addresses, and
                    a guessed one leads to someone else.
                  </p>
                )}

                {f.key === 'discord' && (
                  <div style={{ marginTop: 8 }}>
                    <span className="field-label">
                      Discord user ID (optional)
                    </span>
                    <input
                      type="text"
                      name="discord_id"
                      defaultValue={profile.discord_id ?? ''}
                      placeholder="284719302847193028"
                    />
                    <p className="tiny" style={{ margin: '6px 0 0' }}>
                      Not the old #1234 tag — that is gone. This is the long
                      number under Settings → Advanced → Developer Mode, then
                      right-click your name → Copy User ID. Discord has no
                      profile address built from a username, so without this
                      your handle shows as plain text rather than a link.
                      Optional, and it shares and hides along with your
                      username, never separately.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {state && 'error' in state && state.error && (
        <p className="tiny" style={{ color: 'var(--danger)' }}>
          {state.error}
        </p>
      )}
      {state && 'ok' in state && state.ok && (
        <p className="tiny" style={{ color: 'var(--success)' }}>
          Saved.
        </p>
      )}

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}
