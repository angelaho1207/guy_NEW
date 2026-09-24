'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { pendingExchangeSignature } from '@/app/actions';

/**
 * Stands in for Supabase realtime.
 *
 * The confirmation prompt has to appear on the other person's screen without
 * them doing anything, because the window is thirty seconds long and both
 * people are prompted at once. The real app subscribes; here the page asks.
 *
 * What it asks matters. This used to call `router.refresh()` on a timer, which
 * re-rendered the whole page — five database calls — every two seconds whether
 * or not anything had happened, on every open phone. Now it asks one cheap
 * question and only re-renders when the answer changes, which is rarely.
 */
export function PendingWatcher({ intervalMs = 2500 }: { intervalMs?: number }) {
  const router = useRouter();

  // What the server rendered. Set on the first poll rather than assumed, so
  // arriving with a prompt already on screen does not count as news.
  const seen = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      const sig = await pendingExchangeSignature();
      if (!alive || sig === null) return;

      if (seen.current === null) {
        seen.current = sig;
        return;
      }
      if (sig !== seen.current) {
        seen.current = sig;
        router.refresh();
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), intervalMs);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [router, intervalMs]);

  return null;
}
