'use client';

import { useCallback, useEffect, useState } from 'react';
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
  const [copied, setCopied] = useState(false);

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

  const copy = useCallback(() => {
    if (!code) return;
    // Best effort. Clipboard access is refused in some contexts, and the code
    // is readable on screen regardless -- which is the point of three words.
    navigator.clipboard
      ?.writeText(code.token)
      .then(() => setCopied(true))
      .catch(() => undefined);
  }, [code]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="qr" style={{ minWidth: 200, minHeight: 200 }}>
          {code ? (
            <span dangerouslySetInnerHTML={{ __html: code.svg }} />
          ) : (
            <span style={{ lineHeight: '200px' }}>…</span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="eyebrow">Read this out, or let them scan</div>

          {/* Big, because the whole point of three words is that someone can
              read them off this screen from a step away. */}
          <p className="code-words">{code?.token ?? '···'}</p>

          <div className="btn-row">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={copy}
              disabled={!code}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            {seconds !== null && (
              <span className="pill" data-tone={seconds < 20 ? 'warn' : undefined}>
                {seconds}s
              </span>
            )}
          </div>

          <p className="tiny" style={{ marginBottom: 0 }}>
            Good for {CONNECT_TOKEN_TTL_SECONDS} seconds, and only once. It
            replaces itself before it runs out, so what is on screen always
            works.
          </p>
        </div>
      </div>
    </div>
  );
}
