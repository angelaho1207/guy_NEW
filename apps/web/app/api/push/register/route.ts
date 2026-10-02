import { NextResponse, type NextRequest } from 'next/server';
import { asUser } from '@/lib/db';
import { currentUser } from '@/lib/session';

/**
 * Where the native shell hands over its push token.
 *
 * The browser registers its own subscription through a server action, so this
 * exists only for the app in apps/mobile, which cannot call a server action.
 *
 * Authentication is the session cookie the WebView already holds — which is why
 * the shell sets `sharedCookiesEnabled` and sends `credentials: 'include'`. The
 * app itself never sees a key, and a token therefore cannot be registered
 * against anybody else's account: `register_push_token` reads `auth.uid()` and
 * takes no user id.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = await currentUser();
  // 401 rather than a redirect: the caller is a fetch, not a browser, and a
  // redirect to /login would look like success.
  if (!me) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  let body: { token?: unknown; platform?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'expected json' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null;

  if (!token || !platform) {
    return NextResponse.json({ error: 'token and platform are required' }, { status: 400 });
  }

  try {
    await asUser(me.user_id, `select public.register_push_token($1, $2, null, null)`, [
      token,
      platform,
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: String((err as Error)?.message ?? err).replace(/^error: /i, '') },
      { status: 500 },
    );
  }
}
