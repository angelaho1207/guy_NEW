'use server';

import { asUser } from '@/lib/db';
import { requireUser } from '@/lib/session';

/**
 * Saving and forgetting this browser's push subscription.
 *
 * Both go through SECURITY DEFINER functions that read `auth.uid()` rather than
 * taking a user id, so neither can be aimed at anyone else's device.
 */

/** Annotated rather than inferred, so `'error' in res` narrows to a string. */
export type PushResult = { ok: true } | { error: string };

export async function savePushSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<PushResult> {
  const me = await requireUser();

  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { error: 'That subscription was incomplete.' };
  }

  try {
    await asUser(
      me.user_id,
      `select public.register_push_token($1, 'web', $2, $3)`,
      [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
    );
    return { ok: true as const };
  } catch (err) {
    return { error: String((err as Error)?.message ?? err).replace(/^error: /i, '') };
  }
}

export async function dropPushSubscription(endpoint: string): Promise<PushResult> {
  const me = await requireUser();
  try {
    await asUser(me.user_id, `select public.forget_push_token($1)`, [endpoint]);
    return { ok: true as const };
  } catch (err) {
    return { error: String((err as Error)?.message ?? err).replace(/^error: /i, '') };
  }
}

/** Whether this account has any web subscription at all, for the toggle's label. */
export async function hasPushSubscription(): Promise<boolean> {
  const me = await requireUser();
  const rows = await asUser<{ n: number }>(
    me.user_id,
    `select count(*)::int as n from public.push_tokens
      where user_id = $1 and platform = 'web'`,
    [me.user_id],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}
