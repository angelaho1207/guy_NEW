import { NextResponse, type NextRequest } from 'next/server';
import webpush from 'web-push';
import { asOwner, usingSupabase } from '@/lib/db';

/**
 * The push worker.
 *
 * Called by the database, once a minute, and only when the outbox has something
 * in it — see `notify_push_worker()` in migration 0013 for why it is that way
 * round rather than a scheduled job polling from here.
 *
 * ## How it is allowed to do this
 *
 * It reads other people's notification text, which no signed-in client may do.
 * So it is not authenticated as a person at all: it checks a shared secret and
 * then uses `asOwner`, the connection the server holds. That is the second
 * caller of `asOwner` in the codebase, and worth naming as such — the functions
 * it reaches are granted to neither `anon` nor `authenticated`, so this route is
 * the only way to them.
 *
 * ## What it does about failures
 *
 * `claim_push_batch` counts the attempt as it hands the batch over, so a crash
 * here cannot leave a message retrying forever. Five attempts and a message is
 * left alone with its last error recorded.
 *
 * A 404 or 410 from a push service means the subscription is gone — a reinstall,
 * cleared site data, a long absence. Those are deleted rather than retried,
 * because every future notification for that person would otherwise fail too.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Claimed = {
  outbox_id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function POST(request: NextRequest) {
  const secret = process.env.PUSH_WORKER_SECRET;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:notifications@guy.invalid';

  if (!usingSupabase) {
    // The demo database is in memory and has nobody to notify.
    return NextResponse.json({ skipped: 'demo database' }, { status: 200 });
  }

  if (!secret || !publicKey || !privateKey) {
    // 503 rather than 500: nothing is broken, it is not set up yet, and the
    // database will simply try again next minute once it is.
    return NextResponse.json({ error: 'push is not configured' }, { status: 503 });
  }

  // Timing-safe is overkill for a 32 byte random string compared over TLS, but
  // the length check first means a wrong-length guess leaks nothing either.
  const offered = request.headers.get('x-worker-secret') ?? '';
  if (offered.length !== secret.length || offered !== secret) {
    return NextResponse.json({ error: 'no' }, { status: 401 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const batch = await asOwner<Claimed>(`select * from public.claim_push_batch(50)`);

  if (batch.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, dropped: 0 });
  }

  const sent: string[] = [];
  const failed: { id: string; error: string }[] = [];
  const gone: string[] = [];

  await Promise.all(
    batch.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          JSON.stringify({ title: row.title, body: row.body, data: row.data ?? {} }),
          { TTL: 60 * 60 },
        );
        sent.push(row.outbox_id);
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          gone.push(row.endpoint);
          // Not a failure of the message: there is simply nobody at that
          // address any more. Counted as delivered so it stops being retried.
          sent.push(row.outbox_id);
          return;
        }
        failed.push({
          id: row.outbox_id,
          error: `${status ?? 'error'}: ${(err as Error)?.message ?? 'unknown'}`,
        });
      }
    }),
  );

  if (sent.length > 0) {
    await asOwner(`select public.mark_push_sent($1::uuid[])`, [sent]);
  }

  if (failed.length > 0) {
    // One reason for the batch. Per-message reasons would mean a statement per
    // message, and they are nearly always the same reason anyway.
    await asOwner(`select public.mark_push_failed($1::uuid[], $2)`, [
      failed.map((f) => f.id),
      failed[0].error,
    ]);
  }

  for (const endpoint of new Set(gone)) {
    await asOwner(`select public.drop_push_subscription($1)`, [endpoint]);
  }

  return NextResponse.json({
    sent: sent.length,
    failed: failed.length,
    dropped: new Set(gone).size,
  });
}
