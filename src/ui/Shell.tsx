import type { ReactNode } from 'react';
import { APP_VERSION, BUG_REPORT_URL, IS_BETA } from '../config';

const NAV = [
  { href: '#/', label: 'Library', match: (p: string) => p === '/' || p.startsWith('/exam') || p.startsWith('/import') || p.startsWith('/setup') || p.startsWith('/report') },
  { href: '#/missed', label: 'Missed Questions', match: (p: string) => p.startsWith('/missed') || p.startsWith('/redo') },
  { href: '#/weak', label: 'Weak Areas', match: (p: string) => p.startsWith('/weak') },
  { href: '#/settings', label: 'Settings', match: (p: string) => p.startsWith('/settings') },
  { href: '#/faq', label: 'Help', match: (p: string) => p.startsWith('/faq') },
];

export function Shell({ path, children, wide }: { path: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="dark-focus flex flex-wrap items-center gap-x-6 gap-y-1 bg-navy px-4 py-2 text-white">
        <a href="#/" className="status-font text-lg font-bold">
          Block Sim
          {IS_BETA && <span className="ml-2 bg-yellow-300 px-1 text-xs font-bold text-black" data-testid="beta-badge">BETA</span>}
        </a>
        <nav className="flex flex-wrap gap-1 text-sm" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="px-2 py-1" style={n.match(path) ? { background: '#fff', color: '#1c4973' } : undefined} aria-current={n.match(path) ? 'page' : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
      </header>
      <main className={'mx-auto w-full flex-1 px-4 py-4 ' + (wide ? 'max-w-[1400px]' : 'max-w-5xl')}>{children}</main>
      <footer className="border-t border-gray-300 px-4 py-2 text-xs text-gray-700">
        Block Sim {APP_VERSION}
        {IS_BETA ? ' (beta)' : ''} · Everything stays on this device ·{' '}
        <a className="link" href={BUG_REPORT_URL} target="_blank" rel="noreferrer noopener">
          Report a bug
        </a>
      </footer>
    </div>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <h1 className="mb-3 text-xl font-bold">{children}</h1>;
}
export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-5 border-b border-gray-400 pb-1 text-base font-bold">{children}</h2>;
}
