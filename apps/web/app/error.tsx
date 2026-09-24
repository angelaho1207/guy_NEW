'use client';

import { useEffect } from 'react';

/**
 * What a failed render looks like instead of a blank 500.
 *
 * Almost everything that reaches here is the database being briefly
 * unreachable: a pooled connection timing out, or the free tier's connection
 * cap reached during a burst. None of that is worth a dead white page, and
 * none of it is the person's fault, so say so plainly and offer the retry that
 * usually works.
 *
 * Deliberately not showing the raw message. It is a Postgres error, it means
 * nothing to the person reading it, and error text is the wrong place to learn
 * what a schema looks like. It goes to the console, which is where the Vercel
 * logs pick it up.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('render failed', error);
  }, [error]);

  return (
    <div className="empty">
      <h2>That did not load.</h2>
      <p className="tiny">
        Usually the database was busy for a moment. Trying again normally works.
      </p>
      <div className="btn-row" style={{ justifyContent: 'center', marginTop: 16 }}>
        <button className="btn btn-primary" onClick={reset}>
          Try again
        </button>
      </div>
      {error.digest && (
        <p className="tiny" style={{ marginTop: 16, color: 'var(--text-secondary)' }}>
          Reference {error.digest}
        </p>
      )}
    </div>
  );
}
