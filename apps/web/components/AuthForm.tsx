'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signUp, signIn } from '@/app/auth-actions';

export function AuthForm({ mode }: { mode: 'signup' | 'login' }) {
  const isSignup = mode === 'signup';
  const [state, action, pending] = useActionState(
    isSignup ? signUp : signIn,
    null,
  );

  return (
    <form action={action} className="card" style={{ marginTop: 24 }}>
      <label className="field">
        <span className="field-label">Username</span>
        <input
          type="text"
          name="username"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          placeholder="angela"
        />
      </label>

      {isSignup && (
        <div className="grid-2">
          <label className="field">
            <span className="field-label">
              First name <span style={{ color: 'var(--accent)' }}>*</span>
            </span>
            <input type="text" name="first_name" autoComplete="given-name" />
          </label>
          <label className="field">
            <span className="field-label">
              Last name <span style={{ color: 'var(--accent)' }}>*</span>
            </span>
            <input type="text" name="last_name" autoComplete="family-name" />
          </label>
        </div>
      )}

      {isSignup && (
        <label className="field">
          <span className="field-label">
            Email <span style={{ color: 'var(--accent)' }}>*</span>
          </span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="you@example.com"
          />
          <p className="tiny" style={{ margin: '6px 0 0' }}>
            Used only to hold your account. You sign in with your username, and
            nobody you connect with ever sees this.
          </p>
        </label>
      )}

      <label className="field">
        <span className="field-label">Password</span>
        <input
          type="password"
          name="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
        />
      </label>

      {state && 'error' in state && state.error && (
        <p className="tiny" style={{ color: 'var(--danger)' }}>
          {state.error}
        </p>
      )}

      <button className="btn btn-primary btn-tall" style={{ marginTop: 4 }} disabled={pending}>
        {pending ? 'One moment…' : isSignup ? 'Create account' : 'Sign in'}
      </button>

      <p
        className="tiny"
        style={{
          margin: '16px 0 0',
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
        }}
      >
        <span>{isSignup ? 'Already have one?' : 'No account yet?'}</span>
        <Link className="handle-link" href={isSignup ? '/login' : '/signup'}>
          {isSignup ? 'Sign in' : 'Make one'}
        </Link>
      </p>
    </form>
  );
}
