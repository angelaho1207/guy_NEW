'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/contacts', label: 'Contacts' },
  { href: '/follow-ups', label: 'Follow-ups' },
  { href: '/one-on-ones', label: '1:1s' },
  { href: '/connect', label: 'Connect' },
  { href: '/profile', label: 'Profile' },
];

export function Nav({ counts }: { counts: Record<string, number> }) {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {LINKS.map((link) => {
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
