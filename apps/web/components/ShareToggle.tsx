'use client';

import { toggleShare } from '@/app/actions';
import { useOptimistic, startTransition } from 'react';

/**
 * The standing "shareable" toggle for one field.
 *
 * It says what it does, because it does exactly what it says: turning it off
 * hides that field from everyone you are connected to, immediately, and
 * turning it on shows them its current value. There is no per-person setting
 * and nothing is grandfathered.
 *
 * This is a bare button, not a form. It sits inside the profile form, and a
 * nested <form> is invalid HTML: the browser discards the inner one, so the
 * toggle would have submitted the whole profile instead of flipping a field.
 * `type="button"` keeps it from submitting the form it is standing in.
 */
export function ShareToggle({ field, on }: { field: string; on: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(on);

  return (
    <button
      type="button"
      className="share"
      data-on={optimistic}
      onClick={() => {
        const next = !optimistic;
        startTransition(async () => {
          setOptimistic(next);
          await toggleShare(field, next);
        });
      }}
      title={
        optimistic
          ? 'Shared with everyone you connect with. Click to stop sharing.'
          : 'Not shared with anyone. Click to share.'
      }
    >
      <span className="dot" />
      {optimistic ? 'Shared' : 'Private'}
    </button>
  );
}
