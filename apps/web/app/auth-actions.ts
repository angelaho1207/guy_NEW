'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { supabaseServer, USERNAME_PATTERN } from '@/lib/supabase';
import { asOwner, asUser } from '@/lib/db';
import { currentUser } from '@/lib/session';

/**
 * Signing up and signing in.
 *
 * You sign in with a username, as the brief asks. Supabase Auth is built
 * around an email and refuses an address that could not receive mail, so the
 * synthetic address D2 planned is not possible. An email is collected once at
 * sign-up, never used as the login, never shown to anyone, and is not a
 * profile field so it cannot be shared by accident.
 *
 * The profile row is not created here. A trigger on `auth.users` creates it
 * from the sign-up metadata, in the same transaction, so an account can never
 * exist without one and a bad name aborts the whole sign-up.
 */

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'There is already an account with that email.';
  }
  if (m.includes('profiles_username_key') || m.includes('duplicate key')) {
    return 'That username is taken.';
  }
  if (m.includes('invalid login')) {
    return 'That username and password do not match.';
  }
  if (m.includes('first name and last name')) {
    return 'First and last name are both required.';
  }
  if (m.includes('invalid username')) {
    return 'Usernames are 3 to 30 characters: letters, numbers, dots, underscores.';
  }
  if (m.includes('is invalid') && m.includes('email')) {
    return 'That email address was not accepted. Check it for typos.';
  }
  if (m.includes('password')) {
    return 'That password is too short. Use at least 6 characters.';
  }
  return message;
}

export async function signUp(_prev: unknown, formData: FormData) {
  const username = String(formData.get('username') ?? '').trim().toLowerCase();
  const first = String(formData.get('first_name') ?? '').trim();
  const last = String(formData.get('last_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!USERNAME_PATTERN.test(username)) {
    return {
      error:
        'Usernames are 3 to 30 characters: lowercase letters, numbers, dots and underscores.',
    };
  }
  if (!first || !last) return { error: 'First and last name are both required.' };
  if (!email.includes('@')) return { error: 'Enter an email address.' };
  if (password.length < 6) return { error: 'Use a password of at least 6 characters.' };

  // Checked here for a decent message. The unique index on profiles.username is
  // what actually enforces it, and it wins any race between two sign-ups.
  const taken = await asOwner<{ n: number }>(
    `select count(*)::int as n from public.profiles where username = $1`,
    [username],
  );
  if (Number(taken[0]?.n ?? 0) > 0) return { error: 'That username is taken.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, first_name: first, last_name: last } },
  });

  if (error) return { error: friendly(error.message) };

  revalidatePath('/', 'layout');
  redirect('/profile');
}

/**
 * Where to send someone after signing in, when a redirect brought them here.
 *
 * Only a path on this site, and only one that looks like a path. An open
 * redirect is the classic way this goes wrong: a crafted `next` pointing at
 * another origin turns our sign-in page into a convincing way to send someone
 * somewhere else. A leading `//` is also rejected, because browsers read that
 * as protocol-relative and it would leave the site.
 */
function safeNext(value: FormDataEntryValue | null): string | null {
  const next = typeof value === 'string' ? value.trim() : '';
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  return next;
}

export async function signIn(_prev: unknown, formData: FormData) {
  const username = String(formData.get('username') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!username || !password) return { error: 'Enter your username and password.' };

  // `auth.users` is readable by neither `anon` nor `authenticated`, and nobody
  // is signed in yet, so this is the one query that runs as the connection
  // owner. It is also why the failure message below never distinguishes a
  // wrong password from a username that does not exist.
  const found = await asOwner<{ email: string }>(
    `select u.email
       from public.profiles p
       join auth.users u on u.id = p.user_id
      where p.username = $1`,
    [username],
  );

  const wrong = { error: 'That username and password do not match.' };
  if (!found[0]?.email) return wrong;

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: found[0].email,
    password,
  });

  if (error) return wrong;

  revalidatePath('/', 'layout');
  redirect(safeNext(formData.get('next')) ?? '/contacts');
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

// --- Recovering an account -------------------------------------------------

/**
 * The absolute origin of this request, for links Supabase will email.
 *
 * Read from the request rather than configured, so it is right on localhost, on
 * a preview deployment and in production with nothing to set.
 */
async function origin(): Promise<string> {
  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const proto =
    head.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Sends a reset link.
 *
 * Takes an email rather than a username, for two reasons. The link has to go
 * somewhere, and only the account's own email is that somewhere. And asking for
 * the email keeps this from becoming a way to find out which usernames exist:
 * the reply below is identical whether or not the address has an account, which
 * is why it says "if" rather than "we have".
 */
export async function requestPasswordReset(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!email.includes('@')) return { error: 'Enter the email you signed up with.' };

  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/confirm?next=/reset`,
  });

  // Deliberately not reporting whether that address has an account. An error
  // here would answer a question nobody signed in has the right to ask.
  return {
    sent: true as const,
    message:
      'If that address has an account, a link is on its way. It expires shortly, so use it soon.',
  };
}

/**
 * Sets a new password.
 *
 * Reachable only with a session, which is what the recovery link establishes
 * when /auth/confirm verifies its token. So there is no second place to check
 * that the person is allowed to do this: having a session IS the proof.
 */
export async function setNewPassword(_prev: unknown, formData: FormData) {
  const password = String(formData.get('password') ?? '');
  const again = String(formData.get('password_again') ?? '');

  if (password.length < 8) return { error: 'Use at least eight characters.' };
  if (password !== again) return { error: 'Those two do not match.' };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return {
      error:
        'That link has expired or was already used. Ask for a new one and try again.',
    };
  }

  revalidatePath('/', 'layout');
  redirect('/contacts');
}

// --- Leaving ---------------------------------------------------------------

/**
 * Deletes the account, and everything that hangs off it.
 *
 * The work is in `public.delete_my_account()`, which runs as the migration owner
 * because a person cannot be given rights over `auth.users` without being given
 * rights over everyone in it. Deleting the profile row cascades through the
 * shares, the connections, the notes, the reminders and the tokens, and the
 * other person's notes about you go with it. That is D10, decided deliberately.
 */
export async function deleteAccount(_prev: unknown, formData: FormData) {
  const me = await currentUser();
  if (!me) redirect('/login');

  // Typing the username is the confirmation. A dialog that only needs a tap is
  // not a confirmation for something that cannot be undone.
  const typed = String(formData.get('username') ?? '').trim().toLowerCase();
  if (typed !== me.username) {
    return { error: `Type ${me.username} exactly, to confirm.` };
  }

  try {
    await asUser(me.user_id, `select public.delete_my_account()`);
  } catch (err) {
    return { error: String((err as Error)?.message ?? err).replace(/^error: /i, '') };
  }

  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
