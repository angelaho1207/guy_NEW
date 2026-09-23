'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer, USERNAME_PATTERN } from '@/lib/supabase';
import { asOwner } from '@/lib/db';

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
  redirect('/contacts');
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
