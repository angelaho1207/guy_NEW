'use client';

import { useActionState } from 'react';
import { requestPasswordReset } from '@/app/auth-actions';

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);

  // Once the mail is away there is nothing left to do here, and leaving the form
  // up invites someone to send themselves four more.
  if (state && 'sent' in state && state.sent) {
    return <div className="banner" style={{ marginTop: 24, marginBottom: 0 }}>{state.message}</div>;
  }

  return (
    <form action={action} className="card" style={{ marginTop: 24 }}>
      <label className="field">
        <span className="field-label">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="you@example.com"
        />
      </label>

      {state && 'error' in state && state.error && (
        <p className="tiny" style={{ color: 'var(--danger)' }}>
          {state.error}
        </p>
      )}

      <button className="btn btn-primary btn-tall" disabled={pending}>
        {pending ? 'Sending…' : 'Send the link'}
      </button>
    </form>
  );
}
