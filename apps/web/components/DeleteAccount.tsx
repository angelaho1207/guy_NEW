'use client';

import { useActionState, useState } from 'react';
import { deleteAccount } from '@/app/auth-actions';

/**
 * Leaving.
 *
 * Behind a disclosure and then behind typing your own username, because this
 * cannot be undone and it takes other people's notes about you with it. A single
 * tap is not a confirmation for that.
 */
export function DeleteAccount({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteAccount, null);

  return (
    <div className="card">
      <div className="row-head">
        <div>
          <h3 style={{ margin: 0 }}>Delete your account</h3>
          <p className="tiny" style={{ margin: '4px 0 0' }}>
            Everything goes: your profile, your connections, your notes, and the
            notes other people wrote about you.
          </p>
        </div>
        {!open && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(true)}>
            Delete
          </button>
        )}
      </div>

      {open && (
        <form action={action} style={{ marginTop: 14 }}>
          <label className="field">
            <span className="field-label">
              Type <strong>{username}</strong> to confirm
            </span>
            <input
              type="text"
              name="username"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>

          {state && 'error' in state && state.error && (
            <p className="tiny" style={{ color: 'var(--danger)' }}>
              {state.error}
            </p>
          )}

          <div className="btn-row">
            <button className="btn btn-danger" disabled={pending}>
              {pending ? 'Deleting…' : 'Delete it all'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
              Keep my account
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
