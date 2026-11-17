import { useSyncExternalStore, type ReactNode } from 'react';
import { chooseFolder, folderStatus, onFolderStatus } from '../lib/folder';
import { browserKind, isIPad } from '../lib/install';
import { patchSettings } from '../lib/store';
import { DEMO_ID } from '../lib/demo';
import { go } from '../ui/hooks';
import { InstallHelp } from '../ui/InstallHelp';

const FEATURES: { title: string; text: string; icon: string }[] = [
  { title: 'Any PDF, any answer key', text: 'Text PDFs, scans and screenshots. Keys in a separate PDF, at the end, after each question, or pasted in.', icon: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6' },
  { title: 'A real board-style screen', text: 'Timer, question list, mark, highlight, strike-out, lab values and calculator, all keyboard-friendly.', icon: 'M3 5h18v12H3zM8 21h8M12 17v4' },
  { title: 'Every attempt saved', text: 'Results and analysis for every block. Review weeks later with your highlights and strike-outs as you left them.', icon: 'M4 19V5M4 19h16M8 15l3-4 3 2 4-6' },
  { title: 'Missed-question bank', text: 'Everything you got wrong across all exams, with redos on a spaced schedule until you master it.', icon: 'M4 4h16v16H4zM8 12l3 3 5-6' },
  { title: 'Folders by subject', text: 'Import a whole folder at once. Surgery, OBGYN, Internal Medicine: each subfolder becomes a folder.', icon: 'M3 6h6l2 2h10v11H3z' },
  { title: 'Private by design', text: 'No accounts, no uploads, no tracking. It runs entirely on your computer and works offline.', icon: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4' },
];

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** A small drawing of the exam screen for the hero (pure CSS, no real question content). */
function Preview() {
  const line = (w: string, o = 1) => <div className="h-2 rounded-full" style={{ width: w, background: '#cbd5e1', opacity: o }} />;
  return (
    <div className="relative mx-auto w-full max-w-[460px] select-none" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[32px] opacity-60 blur-2xl" style={{ background: 'radial-gradient(60% 60% at 70% 30%, #6b8cff 0%, transparent 70%)' }} />
      <div className="relative overflow-hidden rounded-2xl border bg-white shadow-2xl" style={{ borderColor: 'rgb(148 163 184 / 0.35)' }}>
        <div className="flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-white" style={{ background: '#1c4973' }}>
          <span>Item 12 of 40</span>
          <span className="flex gap-2 opacity-90">
            <span>Lab Values</span>
            <span>Calculator</span>
          </span>
        </div>
        <div className="flex">
          <div className="w-9 border-r py-1 text-center text-[9px] text-slate-500" style={{ borderColor: '#e2e8f0' }}>
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="py-0.5" style={i === 3 ? { background: '#dbeafe', color: '#1e3a8a', fontWeight: 700 } : undefined}>
                {i + 9}
              </div>
            ))}
          </div>
          <div className="flex-1 space-y-2 p-4">
            {line('95%')}
            {line('88%')}
            <div className="flex items-center gap-1">
              {line('30%')}
              <div className="h-2.5 w-16 rounded-sm" style={{ background: 'rgb(250 204 21 / 0.55)' }} />
              {line('25%')}
            </div>
            {line('70%')}
            <div className="space-y-1.5 pt-2">
              {['A', 'B', 'C', 'D', 'E'].map((l, i) => (
                <div key={l} className="flex items-center gap-2 text-[10px] text-slate-600">
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border" style={i === 2 ? { background: '#2f5be7', borderColor: '#2f5be7' } : { borderColor: '#94a3b8' }}>
                    {i === 2 && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <b>{l}.</b>
                  <div className="relative h-2 rounded-full" style={{ width: `${40 + ((i * 17) % 35)}%`, background: i === 4 ? '#e2e8f0' : '#cbd5e1' }}>
                    {i === 4 && <div className="absolute -left-1 -right-1 top-1/2 h-px bg-slate-500" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-white" style={{ background: '#1c4973' }}>
          <span>Block Time Remaining: 41:27</span>
          <span className="flex gap-2">
            <span>Previous</span>
            <span>Next</span>
          </span>
        </div>
      </div>
      <div className="absolute -bottom-5 -right-3 rounded-xl border bg-white px-3 py-2 shadow-xl" style={{ borderColor: '#e2e8f0' }}>
        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Score</div>
        <div className="text-lg font-bold text-green-600">82%</div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg, #3b6cf6, #1e3a8a)' }}>
          {n}
        </span>
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
          {title}
        </h2>
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function Welcome() {
  const folder = useSyncExternalStore(onFolderStatus, folderStatus);
  const finish = async (to = '/') => {
    await patchSettings({ welcomed: true });
    go(to, true);
  };
  const b = browserKind();
  return (
    <div data-testid="welcome">
      {/* hero */}
      <section className="relative -mx-4 -mt-6 mb-12 overflow-hidden px-4 pb-14 pt-12 sm:-mx-6 sm:px-6 sm:pt-16" style={{ background: 'radial-gradient(80% 60% at 10% 0%, var(--brand-soft) 0%, transparent 60%)' }}>
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: 'var(--line)', background: 'var(--surface)', color: 'var(--ink-2)' }}>
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Free · No account · Works offline
            </div>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl" style={{ color: 'var(--ink)' }}>
              Turn any practice PDF into a <span style={{ background: 'linear-gradient(90deg, #3b6cf6, #7c5cff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>real exam</span>.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: 'var(--ink-2)' }}>
              Load a question PDF and its answer key, then take it in a board-style test screen. Every attempt is saved, so you can come back weeks later and review exactly what you missed.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button className="btn-primary px-5 py-2.5 text-[15px]" onClick={() => void finish(`/setup?exam=${DEMO_ID}`)} data-testid="welcome-demo">
                Try the 5-question demo
              </button>
              <button className="btn px-5 py-2.5 text-[15px]" onClick={() => void finish('/import')}>
                Import my own PDF
              </button>
            </div>
            <div className="muted mt-4 text-xs">
              <b>Works best in Chrome or Edge on a laptop.</b>{' '}
              {b !== 'chromium' && (isIPad() ? 'On iPad it works with touch, but folder saving is not available, so back up regularly.' : 'In this browser it works, but automatic folder saving is not available, so back up regularly.')}
            </div>
          </div>
          <Preview />
        </div>
      </section>

      {/* features */}
      <section className="mb-14">
        <div className="eyebrow mb-2 text-center">Everything you need</div>
        <h2 className="mb-8 text-center text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: 'var(--ink)' }}>
          Practice the way the real test feels
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-hover p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                <Icon d={f.icon} />
              </div>
              <div className="mb-1 font-semibold" style={{ color: 'var(--ink)' }}>
                {f.title}
              </div>
              <p className="muted text-sm leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* setup */}
      <section className="mb-6">
        <div className="eyebrow mb-2 text-center">Get set up in a minute</div>
        <h2 className="mb-8 text-center text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: 'var(--ink)' }}>
          Three quick steps
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <Step n={1} title="Choose where your history is kept">
            {folder.supported ? (
              folder.connected ? (
                <p className="text-green-800" data-testid="welcome-folder-ok">
                  Saving to “{folder.name}”.
                </p>
              ) : (
                <>
                  <p className="muted mb-3">Recommended: a folder called “Test Simulator”, ideally inside iCloud Drive, OneDrive, Dropbox or Google Drive. Your history survives browser clean-ups and follows you to a new computer.</p>
                  <button className="btn-primary" onClick={() => void chooseFolder()} data-testid="welcome-folder">
                    Choose a data folder
                  </button>
                  <p className="muted mt-2 text-xs">Or skip it: history stays in this browser; use Back up now from time to time.</p>
                </>
              )
            ) : (
              <p className="muted">This browser keeps your history in its own storage. Use <b>Back up now</b> on the Library screen every week or two, and keep the backup file somewhere safe.</p>
            )}
          </Step>
          <Step n={2} title="Install the app (optional)">
            <InstallHelp />
          </Step>
          <Step n={3} title="Add your exams">
            <p className="muted mb-3">One PDF at a time, or a whole folder with a subfolder per subject.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => void finish('/import?folder=1')}>
                Import a folder
              </button>
              <button className="btn" onClick={() => void finish('/')} data-testid="welcome-skip">
                Go to the Library
              </button>
            </div>
          </Step>
        </div>
      </section>
      <p className="muted mt-8 text-center text-xs">Nothing you load ever leaves this device. Only import materials you have the right to use.</p>
    </div>
  );
}
