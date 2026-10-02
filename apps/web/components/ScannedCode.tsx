'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { redeemCode } from '@/app/actions';

/**
 * Redeems the code a QR scan carried in, as soon as the page arrives.
 *
 * On the client rather than during the server render, because redeeming spends a
 * single-use code and a server render happens on a GET. A link preview, a
 * prefetch or a pulled-to-refresh would each have spent somebody's code with
 * nobody meaning to.
 *
 * The guard ref matters: React runs effects twice in development, and the second
 * run would redeem a code the first one had already consumed, which looks
 * exactly like a code that never worked.
 */
export function ScannedCode({ code }: { code: string }) {
  const router = useRouter();
  const tried = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;

    void (async () => {
      const res = await redeemCode(code);
      if ('error' in res) {
        setError(res.error);
        return;
      }
      if ('alreadyConnected' in res) {
        setNote('You two are already connected. Nothing happened.');
        return;
      }
      // The prompt is rendered by the page from its own query.
      router.refresh();
    })();
  }, [code, router]);

  if (error) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>That code did not work</h3>
        <p className="tiny" style={{ marginBottom: 0 }}>
          {error}
        </p>
      </div>
    );
  }

  if (note) {
    return (
      <div className="banner" style={{ marginBottom: 0 }}>
        {note}
      </div>
    );
  }

  return (
    <div className="card">
      <p className="tiny" style={{ margin: 0 }}>
        Opening a handshake with whoever showed you that code. Nothing is shared
        until you both confirm.
      </p>
    </div>
  );
}
