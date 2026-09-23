import 'server-only';
import { cookies } from 'next/headers';
import { asAdmin } from './db';

/**
 * Who you are, for the dev server.
 *
 * There is no login yet. Sign up and log in are real screens in the spec and
 * will use Supabase Auth (see D2), but building them would have meant you
 * could not look at anything without an account. So the dev server keeps the
 * current user in a cookie and lets you switch between the seeded people from
 * the header.
 *
 * Being able to switch is not only a convenience. Guy is an app about what two
 * people can see of each other, and the fastest way to check that is to look
 * at the same connection from both sides.
 */

const COOKIE = 'guy_demo_user';

export type DemoUser = {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
};

export async function demoUsers(): Promise<DemoUser[]> {
  return asAdmin<DemoUser>(
    `select user_id, username, first_name, last_name
       from public.profiles
      order by created_at`,
  );
}

export async function currentUser(): Promise<DemoUser> {
  const store = await cookies();
  const wanted = store.get(COOKIE)?.value;
  const users = await demoUsers();

  const found = users.find((u) => u.user_id === wanted);
  // Angela is the first seeded profile, and the default point of view.
  return found ?? users[0];
}

export const SESSION_COOKIE = COOKIE;
