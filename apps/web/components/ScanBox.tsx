'use client';

import { useActionState } from 'react';
import { redeemToken } from '@/app/actions';

/**
 * Typing the other person's code.
 *
 * Not a stand-in for anything any more: a code is three words now, so reading
 * it off someone's screen and typing it is a real path rather than a developer
 * convenience. The server normalises what arrives, so case and spaces are fine.
 *
 * Redeeming does not connect anyone. It opens a handshake that both people
 * still have to confirm, within thirty seconds.
 */
export function ScanBox() {
  const [state, action, pending] = useActionState(redeemToken, null);

  return (
    <div className="card">
      <h3>Type their code</h3>
      <p className="tiny" style={{ marginTop: 0 }}>
        Three words from the other person&rsquo;s screen. Capitals, spaces and
        hyphens all work.
      </p>

      <form action={action}>
        <label className="field">
          <span className="field-label">Their code</span>
          <input
            type="text"
            name="token"
            placeholder="brisk-stubborn-otter"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? 'Opening…' : 'Open exchange'}
        </button>
      </form>

      {state && 'error' in state && state.error && (
        <p className="tiny" style={{ color: 'var(--danger)' }}>
          {state.error}
        </p>
      )}

      {state && 'alreadyConnected' in state && state.alreadyConnected && (
        <div className="banner" style={{ marginBottom: 0 }}>
          <strong>Already connected.</strong> Nothing happened, and their code
          was not used up.
        </div>
      )}

      {state && 'exchangeId' in state && state.exchangeId && (
        <div className="banner" style={{ marginBottom: 0 }}>
          Exchange opened. Confirm it under &ldquo;Waiting on you&rdquo; at the
          top of this page, then switch to the other person and confirm on
          their side too. Nothing is shared until both of you do.
        </div>
      )}
    </div>
  );
}
