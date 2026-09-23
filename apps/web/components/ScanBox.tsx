'use client';

import { useActionState } from 'react';
import { redeemToken } from '@/app/actions';

/**
 * Stands in for the camera.
 *
 * On a phone the scanner reads the code and this step is invisible. In a
 * browser, pasting the other person's code is the same thing: the server sees
 * a token either way, and never an account id.
 *
 * Redeeming does not connect anyone. It opens a handshake that both people
 * still have to confirm, within thirty seconds.
 */
export function ScanBox() {
  const [state, action, pending] = useActionState(redeemToken, null);

  return (
    <div className="card">
      <h3>Scan someone&rsquo;s code</h3>
      <p className="tiny" style={{ marginTop: 0 }}>
        Paste the code from the other person&rsquo;s screen. Switch who you are
        viewing as, up top, to play both sides.
      </p>

      <form action={action}>
        <label className="field">
          <span className="field-label">Their code</span>
          <input type="text" name="token" placeholder="Paste the code" autoComplete="off" />
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
