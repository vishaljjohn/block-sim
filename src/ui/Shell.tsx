import { useState, type ReactNode } from 'react';
import { APP_VERSION, BUG_REPORT_URL, IS_BETA } from '../config';
import { db } from '../db';
import { setActiveExam, useActiveExamId } from '../lib/activeExam';
import { useLive } from './hooks';
import { LabValues } from './panels';

type Item = { href: string; label: string; icon: string; match: (p: string) => boolean; testId?: string };
const I = {
  home: 'M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  book: 'M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z',
  stack: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6',
  miss: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v5m0 3v.5',
  chart: 'M5 20V10M12 20V4M19 20v-7',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-2.5 6.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7m0 3v.5',
  flask: 'M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
};
const GROUPS: { label?: string; items: Item[] }[] = [
  { items: [{ href: '#/', label: 'Dashboard', icon: I.home, match: (p) => p === '/' || p === '', testId: 'nav-dashboard' }] },
  {
    label: 'Learn',
    items: [
      { href: '#/exams', label: 'Exams', icon: I.book, match: (p) => p.startsWith('/exams') || p.startsWith('/exam/') || p.startsWith('/setup'), testId: 'nav-exams' },
      { href: '#/queue', label: 'Review Queue', icon: I.stack, match: (p) => p.startsWith('/queue') || p.startsWith('/redo'), testId: 'nav-queue' },
      { href: '#/import', label: 'Import', icon: I.upload, match: (p) => p.startsWith('/import'), testId: 'nav-import' },
    ],
  },
  {
    label: 'Review',
    items: [
      { href: '#/history', label: 'Test History', icon: I.history, match: (p) => p.startsWith('/history') || p.startsWith('/report'), testId: 'nav-history' },
      { href: '#/notes', label: 'My Notes', icon: I.note, match: (p) => p.startsWith('/notes'), testId: 'nav-notes' },
      { href: '#/missed', label: 'Missed Questions', icon: I.miss, match: (p) => p.startsWith('/missed'), testId: 'nav-missed' },
      { href: '#/reports', label: 'Reports', icon: I.chart, match: (p) => p.startsWith('/reports'), testId: 'nav-reports' },
    ],
  },
];
const BOTTOM: Item[] = [
  { href: '#/settings', label: 'Settings', icon: I.gear, match: (p) => p.startsWith('/settings'), testId: 'nav-settings' },
  { href: '#/faq', label: 'Help', icon: I.help, match: (p) => p.startsWith('/faq'), testId: 'nav-help' },
];

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={d} />
    </svg>
  );
}

/** The app mark: an answer sheet with one chosen answer (same drawing as the app icon). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <rect width="16" height="16" rx="1.5" fill="#1f2d3d" />
      <rect x="3.5" y="3" width="9" height="10" rx="0.8" fill="#fdfcf9" />
      <circle cx="5.6" cy="5.3" r=".75" fill="none" stroke="#94a3b8" strokeWidth=".32" />
      <circle cx="5.6" cy="8" r=".75" fill="#a3492a" />
      <circle cx="5.6" cy="10.7" r=".75" fill="none" stroke="#94a3b8" strokeWidth=".32" />
      <rect x="7" y="4.9" width="4.2" height=".8" rx=".4" fill="#cbd5e1" />
      <rect x="7" y="7.6" width="4.2" height=".8" rx=".4" fill="#1f2d3d" />
      <rect x="7" y="10.3" width="4.2" height=".8" rx=".4" fill="#cbd5e1" />
    </svg>
  );
}

function NavLink({ it, path, onGo }: { it: Item; path: string; onGo?: () => void }) {
  const on = it.match(path);
  return (
    <a
      href={it.href}
      onClick={onGo}
      data-testid={it.testId}
      aria-current={on ? 'page' : undefined}
      className="relative flex items-center gap-3 rounded-sm px-3 py-2 text-[14px] font-medium transition-colors"
      style={on ? { background: 'var(--surface-2)', color: 'var(--ink)', boxShadow: 'inset 3px 0 0 var(--brand)' } : { color: 'var(--ink-2)' }}
    >
      <Icon d={it.icon} />
      {it.label}
    </a>
  );
}

/** The exam "on your desk", shown in the top bar with a quick switcher. */
function ActiveExam() {
  const id = useActiveExamId();
  const exams = useLive(() => db.exams.toArray(), []) ?? [];
  const [open, setOpen] = useState(false);
  const cur = exams.find((e) => e.id === id) ?? exams.find((e) => !e.isDemo) ?? exams[0];
  if (!exams.length) return null;
  return (
    <div className="relative">
      <button className="flex items-center gap-3 border px-3 py-1.5 text-right" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }} onClick={() => setOpen((o) => !o)} data-testid="active-exam" aria-expanded={open}>
        <span>
          <span className="eyebrow block">Active exam</span>
          <span className="block max-w-[240px] truncate text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
            {cur?.name ?? '—'}
          </span>
        </span>
        <Icon d={I.swap} size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 max-h-[60vh] w-[320px] overflow-y-auto border bg-[var(--surface)] py-1 text-sm shadow-lg" style={{ borderColor: 'var(--rule)' }} role="menu">
          {exams
            .slice()
            .sort((a, b) => (a.subject ?? '').localeCompare(b.subject ?? '') || a.name.localeCompare(b.name, undefined, { numeric: true }))
            .map((e) => (
              <button
                key={e.id}
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left hover:bg-[var(--surface-2)]"
                style={e.id === cur?.id ? { color: 'var(--brand)', fontWeight: 600 } : undefined}
                onClick={() => {
                  setActiveExam(e.id);
                  setOpen(false);
                }}
              >
                <span className="eyebrow mr-2">{e.subject || 'No folder'}</span>
                {e.name}
              </button>
            ))}
          <a className="block border-t px-3 py-2 font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--brand)' }} href="#/exams" onClick={() => setOpen(false)}>
            All exams →
          </a>
        </div>
      )}
    </div>
  );
}

export function Shell({ path, children, wide }: { path: string; children: ReactNode; wide?: boolean }) {
  const [labs, setLabs] = useState(false);
  const [menu, setMenu] = useState(false);
  return (
    <div className="app flex min-h-full">
      {/* sidebar */}
      <aside
        className={'fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r transition-transform lg:translate-x-0 ' + (menu ? 'translate-x-0' : '-translate-x-full')}
        style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}
        aria-label="Main"
      >
        <a href="#/" className="flex h-[72px] items-center gap-2.5 border-b px-6" style={{ borderColor: 'var(--line)' }} aria-label="Test Simulator: Dashboard">
          <Logo />
          <span className="serif text-[19px] font-bold" style={{ color: 'var(--ink)' }}>
            Test Simulator
          </span>
        </a>
        <nav className="flex-1 overflow-y-auto px-4 py-4">
          {GROUPS.map((g, i) => (
            <div key={i} className="mb-2">
              {g.label && <div className="rule-label my-3">{g.label}</div>}
              <div className="space-y-0.5">
                {g.items.map((it) => (
                  <NavLink key={it.href} it={it} path={path} onGo={() => setMenu(false)} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-0.5 border-t px-4 py-3" style={{ borderColor: 'var(--line)' }}>
          {BOTTOM.map((it) => (
            <NavLink key={it.href} it={it} path={path} onGo={() => setMenu(false)} />
          ))}
          <div className="px-3 pt-2 text-[11px]" style={{ color: 'var(--ink-3)' }}>
            v{APP_VERSION}
            {IS_BETA ? ' beta' : ''} · on this device ·{' '}
            <a className="link" href={BUG_REPORT_URL} target="_blank" rel="noreferrer noopener">
              Report a bug
            </a>
          </div>
        </div>
      </aside>
      {menu && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMenu(false)} />}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[240px]">
        {/* top bar */}
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b px-4 sm:px-8" style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--bg) 92%, transparent)', backdropFilter: 'blur(6px)' }}>
          <button className="btn lg:hidden" onClick={() => setMenu(true)} aria-label="Open the menu">
            ☰
          </button>
          {IS_BETA && (
            <span className="pill" style={{ color: '#92400e', background: '#fef3c7', borderColor: '#f59e0b' }} data-testid="beta-badge">
              Beta
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <button className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-[14px] font-medium" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)', color: 'var(--ink)' }} onClick={() => setLabs((l) => !l)} data-testid="nav-labs">
              <Icon d={I.flask} size={16} /> Lab Values
            </button>
            <ActiveExam />
          </div>
        </header>
        <main className={'mx-auto w-full flex-1 px-4 py-8 sm:px-8 ' + (wide ? 'max-w-[1500px]' : 'max-w-[1240px]')}>{children}</main>
      </div>
      {labs && <LabValues onClose={() => setLabs(false)} top={72} bottom={0} />}
    </div>
  );
}

export function H1({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-[32px] font-bold leading-tight sm:text-[36px]" style={{ color: 'var(--ink)' }}>
        {children}
      </h1>
      {sub && (
        <p className="mt-1 text-[15px]" style={{ color: 'var(--ink-2)' }}>
          {sub}
        </p>
      )}
    </div>
  );
}
export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 text-[19px] font-bold" style={{ color: 'var(--ink)' }}>
      {children}
    </h2>
  );
}
