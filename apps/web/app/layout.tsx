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
    const [f] = await asUser<{ n: number }>(
      me.user_id,
      `select count(*)::int as n from public.undone_follow_ups`,
    );
    const [p] = await asUser<{ n: number }>(
      me.user_id,
      `select count(*)::int as n from public.visible_one_on_ones
        where recipient_id = $1 and status = 'pending'`,
      [me.user_id],
    );
    followUps = Number(f?.n ?? 0);
    pending = Number(p?.n ?? 0);
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
