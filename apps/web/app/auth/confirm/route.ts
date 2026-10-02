import { type NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Where an emailed link lands.
 *
 * Supabase sends a one-time token rather than a session. This exchanges it for
 * one and then forwards to wherever the link said to go, which for a password
 * reset is `/reset`. Having a session is what proves the person read the email,
 * so `/reset` needs no further check of its own.
 *
 * `next` is only ever used as a path on this site. A crafted absolute URL here
 * would turn an email we sent into a convincing way to send someone elsewhere.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const requested = url.searchParams.get('next') ?? '/contacts';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/contacts';

  const failed = new URL('/login', url.origin);
  failed.searchParams.set('expired', '1');

  if (!tokenHash || !type) return NextResponse.redirect(failed);

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({
    type: type as 'recovery' | 'email' | 'signup' | 'invite' | 'email_change',
    token_hash: tokenHash,
  });

  if (error) return NextResponse.redirect(failed);

  return NextResponse.redirect(new URL(next, url.origin));
}
