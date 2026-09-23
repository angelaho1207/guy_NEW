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
 */
export function ShareToggle({ field, on }: { field: string; on: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(on);

  return (
    <form
      action={(formData: FormData) => {
        startTransition(() => setOptimistic(!optimistic));
        return toggleShare(formData);
      }}
    >
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="on" value={String(!optimistic)} />
      <button
        className="share"
        data-on={optimistic}
        title={
          optimistic
            ? 'Shared with everyone you connect with. Click to stop sharing.'
            : 'Not shared with anyone. Click to share.'
        }
      >
        <span className="dot" />
        {optimistic ? 'Shared' : 'Private'}
      </button>
    </form>
  );
}
