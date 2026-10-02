'use client';

import { useActionState, useEffect, useState } from 'react';
import { confirmExchange, declineExchange } from '@/app/actions';
import { CONFIRMATION_TIMEOUT_MS } from '@guy/shared';

/**
 * The thirty second confirmation prompt.
 *
 * The countdown is cosmetic: the database refuses a late confirmation whether
 * or not this timer is running. It is here because a window you cannot see is
 * a window you will miss.
 */
export function ConfirmPrompt({
  exchangeId,
  peerName,
  expiresAt,
  youConfirmed,
}: {
  exchangeId: string;
  peerName: string;
  expiresAt: string;
  youConfirmed: boolean;
}) {
  const [state, action, pending] = useActionState(confirmExchange, null);
  const [left, setLeft] = useState(() => remaining(expiresAt));

  useEffect(() => {
    const t = setInterval(() => setLeft(remaining(expiresAt)), 250);
    return () => clearInterval(t);
  }, [expiresAt]);

  const expired = left <= 0;
  const seconds = Math.ceil(left / 1000);
  const pct = Math.max(0, Math.min(100, (left / CONFIRMATION_TIMEOUT_MS) * 100));

  return (
    // `glowing` is the expressive treatment, and the one place a theme changes
    // the treatment rather than a value: on midnight it is a lit edge blooming
    // onto the dark ground, on daylight the gradient fills the card, because
    // light cast onto white is invisible. An expired prompt is an ordinary card
    // again -- nothing about a timed-out exchange is celebratory.
    <div className={expired ? 'card' : 'card glowing'}>
      <div className="row-head">
        <h2 style={{ margin: 0, fontSize: 30 }}>Share with {peerName}?</h2>
        <span className="pill" data-tone={expired ? undefined : 'accent'}>
          {expired ? 'Timed out' : `${seconds}s`}
        </span>
      </div>

      <div
        style={{
          height: 2,
          background: 'var(--border)',
          borderRadius: 2,
          margin: '12px 0',
        }}
      >
        <div
          style={{
            height: 2,
            width: `${pct}%`,
            background: 'var(--accent)',
            borderRadius: 2,
          }}
        />
      </div>

      <p className="tiny" style={{ marginTop: 0 }}>
        {youConfirmed
          ? `Waiting for ${peerName}. Nothing is shared until they confirm too.`
          : 'They will get whatever you are sharing right now, and you will get whatever they are sharing.'}
      </p>

      {state && 'error' in state && state.error && (
        <p className="tiny" style={{ color: 'var(--danger)' }}>
          {state.error}
        </p>
      )}
      {state && 'state' in state && state.state === 'completed' && (
        <p className="tiny" style={{ color: 'var(--success)' }}>
          Connected. They are in your contacts.
        </p>
      )}
      {state && 'state' in state && state.state === 'expired' && (
        <p className="tiny" style={{ color: 'var(--danger)' }}>
          That took too long. Nothing was shared. Scan again to retry.
        </p>
      )}

      {!youConfirmed && !expired && (
        <div className="btn-row" style={{ marginTop: 4 }}>
          <form action={action}>
            <input type="hidden" name="exchange_id" value={exchangeId} />
            <button className="btn btn-primary" disabled={pending}>
              Confirm
            </button>
          </form>
          <form action={declineExchange}>
            <input type="hidden" name="exchange_id" value={exchangeId} />
            <button className="btn btn-quiet">Not now</button>
          </form>
        </div>
      )}
    </div>
  );
}

function remaining(expiresAt: string) {
  return new Date(expiresAt).getTime() - Date.now();
}
