import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Nav } from '@/components/Nav';
import { UserSwitcher } from '@/components/UserSwitcher';
import { currentUser, demoUsers } from '@/lib/session';
import { asUser, usingSupabase } from '@/lib/db';
import { signOut } from '@/app/auth-actions';

export const metadata: Metadata = {
  title: 'Guy',
  description: 'Consent-based, tap-to-share networking.',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Null on the sign-in and sign-up screens, which this layout also wraps.
  const me = await currentUser();
  const users = await demoUsers();

  let followUps = 0;
  let pending = 0;

  if (me) {
    // Both badge counts in one query. Two reads that always happen together
    // are two pooled connections and two round trips for no reason, and this
    // layout re-renders on every poll.
    const [counts] = await asUser<{ follow_ups: number; pending: number }>(
      me.user_id,
      `select
         (select count(*)::int from public.undone_follow_ups) as follow_ups,
         (select count(*)::int from public.visible_one_on_ones
           where recipient_id = $1 and status = 'pending') as pending`,
      [me.user_id],
    );
    followUps = Number(counts?.follow_ups ?? 0);
    pending = Number(counts?.pending ?? 0);
  }

  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href={me ? '/contacts' : '/login'} className="wordmark">
              Guy<span>.</span>
            </Link>

            {me && usingSupabase && (
              <div className="switcher">
                <span className="tiny">@{me.username}</span>
                <form action={signOut}>
                  <button className="btn btn-quiet btn-sm">Sign out</button>
                </form>
              </div>
            )}

            {me && !usingSupabase && (
              <UserSwitcher users={users} current={me.user_id} />
            )}
          </div>
        </header>

        <div className="shell">
          {me && (
            <Nav
              counts={{
                '/follow-ups': followUps,
                '/one-on-ones': pending,
              }}
            />
          )}
          {children}
        </div>
      </body>
    </html>
  );
}
