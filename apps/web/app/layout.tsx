import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Nav, TopLink } from '@/components/Nav';
import { UserSwitcher } from '@/components/UserSwitcher';
import { currentUser, demoUsers } from '@/lib/session';
import { asUser, usingSupabase } from '@/lib/db';
import { signOut } from '@/app/auth-actions';

export const metadata: Metadata = {
  title: 'Guy',
  description: 'Consent-based, tap-to-share networking.',
};

export const dynamic = 'force-dynamic';

/**
 * Resolves the theme before the page paints.
 *
 * Without this there is a visible flash: the server cannot know what a browser
 * prefers, so it would send one ground and JavaScript would swap it a moment
 * later. Running here, inline and blocking, means the first paint is already
 * right.
 *
 * It also means globals.css needs no `prefers-color-scheme` block. The system
 * preference is turned into an explicit `data-theme` here, so the stylesheet
 * holds each palette exactly once -- and one copy of a palette is the whole
 * point of having tokens.
 */
const THEME_SCRIPT = `
try {
  var stored = localStorage.getItem('guy-theme');
  var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.dataset.theme =
    stored === 'midnight' || stored === 'daylight'
      ? stored
      : prefersLight ? 'daylight' : 'midnight';
} catch (e) {
  document.documentElement.dataset.theme = 'midnight';
}
`;

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
    // The theme script writes to <html> before React hydrates, which React
    // would otherwise report as a mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href={me ? '/contacts' : '/login'} className="wordmark">
              Guy<span>.</span>
            </Link>

            {me && <TopLink href="/connect" label="Connect" />}

            {me && usingSupabase && (
              <div className="account">
                <TopLink href="/profile" label="Profile" />
                <span className="tiny">@{me.username}</span>
                <form action={signOut}>
                  <button className="btn btn-quiet btn-sm">Sign out</button>
                </form>
              </div>
            )}

            {me && !usingSupabase && (
              <div className="account">
                <TopLink href="/profile" label="Profile" />
                <UserSwitcher users={users} current={me.user_id} />
              </div>
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
