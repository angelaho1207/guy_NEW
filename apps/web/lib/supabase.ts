import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase Auth, server side.
 *
 * Only ever used for accounts: signing up, signing in, and reading who the
 * request belongs to. Data goes through `./db`, which talks to Postgres
 * directly and applies row level security as that person.
 *
 * v1 signs in with a username and a password. Supabase Auth is built around
 * an email address, and it refuses one that could not actually receive mail,
 * so the synthetic address D2 originally planned does not work. Instead an
 * email is collected once at sign-up and never used as the login. Sign-in
 * takes a username and resolves it to that address server side.
 *
 * The email is never shown to anyone and is not a profile field, so it cannot
 * be shared by accident. See D2.
 */

export const USERNAME_PATTERN = /^[a-z0-9._]{3,30}$/;

export async function supabaseServer() {
  const store = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) {
              store.set(name, value, options);
            }
          } catch {
            // Called from a server component, where cookies are read-only.
            // The middleware refreshes the session instead, which is why it
            // exists.
          }
        },
      },
    },
  );
}
