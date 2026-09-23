'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Stands in for Supabase realtime.
 *
 * The confirmation prompt has to appear on the other person's screen without
 * them doing anything, because the window is thirty seconds long and the spec
 * says both people are prompted at once. The real app subscribes; here the
 * page just asks again every couple of seconds.
 *
 * Minting moved out of the page render precisely so this is safe: refreshing
 * no longer replaces the code on screen.
 */
export function PendingWatcher({ intervalMs = 2000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
