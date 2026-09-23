'use client';

import { useEffect, useState } from 'react';
import { mintToken } from '@/app/actions';
import {
  CONNECT_TOKEN_REFRESH_SECONDS,
  CONNECT_TOKEN_TTL_SECONDS,
} from '@guy/shared';

type Code = { token: string; expiresAt: string; svg: string };

/**
 * Your connect code.
 *
 * Minting happens here rather than while the page renders, because minting
 * retires the previous token: a page that minted on every render would kill
 * the code currently on someone's screen every time anything else refreshed.
 *
 * The code re-mints shortly before it expires, so the screen always shows a
 * live one without any single token living longer than it should.
 */
export function CodePanel() {
  const [code, setCode] = useState<Code | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const next = await mintToken();
      if (!cancelled) setCode(next);
    };

    refresh();
    const timer = setInterval(refresh, CONNECT_TOKEN_REFRESH_SECONDS * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!code) return;
    const tick = () =>
      setLeft(Math.max(0, new Date(code.expiresAt).getTime() - Date.now()));
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [code]);

  const seconds = left === null ? null : Math.ceil(left / 1000);

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="qr" style={{ minWidth: 200, minHeight: 200 }}>
          {code ? (
            <span dangerouslySetInnerHTML={{ __html: code.svg }} />
          ) : (
            <span style={{ color: '#0B0B0D', lineHeight: '200px' }}>…</span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <p className="tiny" style={{ marginTop: 0 }}>
            Good for {CONNECT_TOKEN_TTL_SECONDS} seconds, and only once. It
            replaces itself before it runs out, so what is on screen always
            works.
            {seconds !== null && (
              <>
                {' '}
                <span className="pill" data-tone={seconds < 20 ? 'accent' : undefined}>
                  {seconds}s
                </span>
              </>
            )}
          </p>

          <p className="field-label">Paste this into the other browser</p>
          <input
            type="text"
            readOnly
            value={code?.token ?? ''}
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="tiny">
            On a phone nobody sees this string. It is here so you can walk
            through both sides of the flow yourself.
          </p>
        </div>
      </div>
    </div>
  );
}
