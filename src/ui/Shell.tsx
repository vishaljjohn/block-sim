import type { ReactNode } from 'react';
import { APP_VERSION, BUG_REPORT_URL, IS_BETA } from '../config';

const NAV = [
  { href: '#/', label: 'Library', icon: 'M4 5h6v14H4zM14 5h6v14h-6z', match: (p: string) => p === '/' || p.startsWith('/exam') || p.startsWith('/import') || p.startsWith('/setup') || p.startsWith('/report') },
  { href: '#/missed', label: 'Missed Questions', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v6m0 3.5v.5', match: (p: string) => p.startsWith('/missed') || p.startsWith('/redo') },
  { href: '#/settings', label: 'Settings', icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 12h2m12 0h2M12 4v2m0 12v2M6.3 6.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4', match: (p: string) => p.startsWith('/settings') },
  { href: '#/faq', label: 'Help', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-2.5 6.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7m0 3v.5', match: (p: string) => p.startsWith('/faq') },
];

/** The app mark: an answer sheet with one chosen answer (same drawing as the app icon). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b6cf6" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      <rect width="16" height="16" rx="3.6" fill="url(#logo-g)" />
      <rect x="3.5" y="3" width="9" height="10" rx="1.2" fill="#fff" />
      <circle cx="5.6" cy="5.3" r=".75" fill="none" stroke="#94a3b8" strokeWidth=".32" />
      <circle cx="5.6" cy="8" r=".75" fill="#22c55e" />
      <circle cx="5.6" cy="10.7" r=".75" fill="none" stroke="#94a3b8" strokeWidth=".32" />
      <rect x="7" y="4.9" width="4.2" height=".8" rx=".4" fill="#cbd5e1" />
      <rect x="7" y="7.6" width="4.2" height=".8" rx=".4" fill="#1e3a8a" />
      <rect x="7" y="10.3" width="4.2" height=".8" rx=".4" fill="#cbd5e1" />
    </svg>
  );
}

export function Shell({ path, children, wide }: { path: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="app flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b backdrop-blur-md" style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--surface) 82%, transparent)' }}>
        <div className={'mx-auto flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6 ' + (wide ? 'max-w-[1400px]' : 'max-w-6xl')}>
          <a href="#/" className="flex items-center gap-2.5" aria-label="Test Simulator: Library">
            <Logo />
            <span className="text-[17px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
              Test Simulator
            </span>
            {IS_BETA && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: '#fef3c7', color: '#92400e' }} data-testid="beta-badge">
                Beta
              </span>
            )}
          </a>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Main">
            {NAV.map((n) => {
              const on = n.match(path);
              return (
                <a
                  key={n.href}
                  href={n.href}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors"
                  style={on ? { background: 'var(--brand-soft)', color: 'var(--brand)' } : { color: 'var(--ink-2)' }}
                  aria-current={on ? 'page' : undefined}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="hidden sm:block">
                    <path d={n.icon} />
                  </svg>
                  {n.label}
                </a>
              );
            })}
          </nav>
        </div>
      </header>
      <main className={'mx-auto w-full flex-1 px-4 py-6 sm:px-6 ' + (wide ? 'max-w-[1400px]' : 'max-w-6xl')}>{children}</main>
      <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
        <div className={'mx-auto flex w-full flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs sm:px-6 ' + (wide ? 'max-w-[1400px]' : 'max-w-6xl')} style={{ color: 'var(--ink-3)' }}>
          <span className="flex items-center gap-2">
            <Logo size={16} />
            Test Simulator {APP_VERSION}
            {IS_BETA ? ' (beta)' : ''}
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              Everything stays on this device
            </span>
            <a className="link" href={BUG_REPORT_URL} target="_blank" rel="noreferrer noopener">
              Report a bug
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <h1 className="mb-4 text-2xl font-semibold tracking-tight sm:text-[28px]">{children}</h1>;
}
export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 text-[15px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>
      {children}
    </h2>
  );
}
