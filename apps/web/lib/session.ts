import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { asAdmin, asUser, usingSupabase } from './db';
import { supabaseServer } from './supabase';

/**
 * Who this request belongs to.
 *
 * Against Supabase this is a real signed-in account. Against the demo database
 * there are no accounts, so the current person is kept in a cookie and chosen
 * from a switcher in the header. Being able to switch is how you look at the
 * same connection from both sides, which is most of what there is to check in
 * an app about what two people can see of each other.
 */

const COOKIE = 'guy_demo_user';

export type Person = {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
};

/** The seeded cast, for the demo switcher. Empty against a real project. */
export async function demoUsers(): Promise<Person[]> {
  if (usingSupabase) return [];
  return asAdmin<Person>(
    `select user_id, username, first_name, last_name
       from public.profiles
      order by created_at`,
  );
}

/** Whoever is signed in, or null. Safe to call from anywhere. */
export async function currentUser(): Promise<Person | null> {
  if (usingSupabase) {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const [profile] = await asUser<Person>(
      user.id,
      `select user_id, username, first_name, last_name from public.profiles`,
    );
    return profile ?? null;
  }

  const store = await cookies();
  const wanted = store.get(COOKIE)?.value;
  const users = await demoUsers();
  // Angela is the first seeded profile, and the default point of view.
  return users.find((u) => u.user_id === wanted) ?? users[0] ?? null;
}

/**
 * Whoever is signed in, or off to the sign-in screen.
 *
 * The middleware already turns away requests with no session, so reaching the
 * redirect here means something slipped past it: a session that expired
 * mid-request, or an account whose profile row is missing.
 */
export async function requireUser(): Promise<Person> {
  const person = await currentUser();
  if (!person) redirect('/login');
  return person;
}

export const SESSION_COOKIE = COOKIE;
