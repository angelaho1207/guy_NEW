'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Navigation, split across two bars.
 *
 * The three places you go to read something — contacts, follow-ups, 1:1s —
 * sit along the bottom, in thumb reach. Connect and Profile live in the top
 * bar: Connect on the left because it is the thing you open in front of
 * another person, Profile on the right with the account it belongs to.
 */

const BOTTOM = [
  { href: '/contacts', label: 'Contacts' },
  { href: '/follow-ups', label: 'Follow-ups' },
  { href: '/one-on-ones', label: '1:1s' },
];

/** A single pill in the top bar. */
export function TopLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  return (
    <Link className="toplink" href={href} data-active={pathname.startsWith(href)}>
      {label}
    </Link>
  );
}

/** The bottom bar. */
export function Nav({ counts }: { counts: Record<string, number> }) {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {BOTTOM.map((link) => {
        const active = pathname.startsWith(link.href);
        const count = counts[link.href] ?? 0;
        return (
          <Link key={link.href} href={link.href} data-active={active}>
            {link.label}
            {count > 0 && <span className="badge">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
