'use client';

import { useActionState } from 'react';
import { setNewPassword } from '@/app/auth-actions';

export function ResetForm() {
  const [state, action, pending] = useActionState(setNewPassword, null);

  return (
    <form action={action} className="card" style={{ marginTop: 24 }}>
      <label className="field">
        <span className="field-label">New password</span>
        <input type="password" name="password" autoComplete="new-password" />
      </label>
      <label className="field">
        <span className="field-label">Again</span>
        <input type="password" name="password_again" autoComplete="new-password" />
      </label>

      {state && 'error' in state && state.error && (
        <p className="tiny" style={{ color: 'var(--danger)' }}>
          {state.error}
        </p>
      )}

      <button className="btn btn-primary btn-tall" disabled={pending}>
        {pending ? 'Saving…' : 'Save and sign in'}
      </button>
    </form>
  );
}
