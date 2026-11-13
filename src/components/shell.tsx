/**
 * Description:  Top bar with the navigation and account menu, plus the falling snow behind every
 *               signed-in page.
 * Author:       Alex Wu
 * Dependencies: next, domain/types.ts, components/decor.tsx, components/snowfall.tsx
 * Usage:
 */
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Context } from '@/domain/types';
import { TreeArt } from './decor';
import { Snowfall } from './snowfall';
const NAV = [
  { href: '/dashboard', label: 'Home', match: ['/dashboard', '/exchanges'] },
  { href: '/wishlist', label: 'Wishlist', match: ['/wishlist'] },
  { href: '/servers', label: 'Servers', match: ['/servers', '/groups'] },
];
export function Shell({ context, children }: { context: Context; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="app-shell">
      <header className="topbar snow-edge">
        <div className="topbar-inner">
          <Link className="brand" href="/dashboard">
            <TreeArt />
            Secret Santa
          </Link>
          <nav className="tabs" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.match.some((m) => path.startsWith(m)) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <details className="account">
            <summary aria-label={`Account menu for ${context.user.display_name}`}>
              {context.user.display_name.slice(0, 1).toUpperCase()}
            </summary>
            <div className="account-menu">
              <div className="who">
                {context.user.display_name}
                <small>{context.owner ? 'Owner' : 'Signed in with Discord'}</small>
              </div>
              <form action="/auth/logout" method="post">
                <button>Sign out</button>
              </form>
            </div>
          </details>
        </div>
      </header>
      <main id="main" className="app-main">
        <Snowfall density={11000} />
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
