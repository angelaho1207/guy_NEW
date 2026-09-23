import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Nav } from '@/components/Nav';
import { UserSwitcher } from '@/components/UserSwitcher';
import { currentUser, demoUsers } from '@/lib/session';
import { asUser } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Guy',
  description: 'Consent-based, tap-to-share networking.',
};

// The dev database lives in the server process and is seeded per boot, so
// nothing here can be prerendered.
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await currentUser();
  const users = await demoUsers();

  const [followUps] = await asUser<{ n: number }>(
    me.user_id,
    `select count(*)::int as n from public.undone_follow_ups`,
  );

  const [pending] = await asUser<{ n: number }>(
    me.user_id,
    `select count(*)::int as n from public.visible_one_on_ones
      where recipient_id = $1 and status = 'pending'`,
    [me.user_id],
  );

  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/contacts" className="wordmark">
              Guy<span>.</span>
            </Link>
            <UserSwitcher users={users} current={me.user_id} />
          </div>
        </header>

        <div className="shell">
          <Nav
            counts={{
              '/follow-ups': Number(followUps?.n ?? 0),
              '/one-on-ones': Number(pending?.n ?? 0),
            }}
          />
          {children}
        </div>
      </body>
    </html>
  );
}
