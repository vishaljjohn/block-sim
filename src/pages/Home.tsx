import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BACKUP_WARN_DAYS, STORAGE_PREFIX } from '../config';
import { db } from '../db';
import type { Attempt, Exam } from '../types';
import { buildMissedBank } from '../lib/missed';
import { setActiveExam, useActiveExamId } from '../lib/activeExam';
import { progressOf, questionStats } from '../lib/stats';
import { deleteAttempt, deleteExam, getSettings, saveExam } from '../lib/store';
import { folderStatus, onFolderStatus, reconnectFolder } from '../lib/folder';
import { exportBackup } from '../lib/backup';
import { downloadBlob } from '../lib/csv';
import { daysAgo, fmtDate, go, useLive } from '../ui/hooks';
import { H1, H2 } from '../ui/Shell';
import { PaperModal } from '../ui/PaperModal';
import { FolderPicker } from '../ui/FolderPicker';

export function useFolderStatus() {
  return useSyncExternalStore(onFolderStatus, folderStatus);
}

export function backupFileName(): string {
  return `test-simulator-backup-${new Date().toISOString().slice(0, 10)}.zip`;
}

const SEL_KEY = STORAGE_PREFIX + 'library-folder';
const FAV_KEY = STORAGE_PREFIX + 'favorite-exams';
const BADGE = ['#1f3a5f', '#0f766e', '#8a3b1e', '#4d6b1f', '#6d28d9', '#a3202f', '#9a6304', '#2f5d8a'];
const UNSORTED = 'Unsorted';
const catOf = (e: Exam) => e.subject?.trim() || UNSORTED;


export function Home() {
  const exams = useLive(() => db.exams.orderBy('updatedAt').reverse().toArray(), []);
  const attempts = useLive(() => db.attempts.toArray(), []);
  const reviews = useLive(() => db.reviews.toArray(), []);
  const settings = useLive(() => getSettings(), []);
  const folder = useFolderStatus();
  const [del, setDel] = useState<Exam | null>(null);
  const [move, setMove] = useState<Exam | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState('');
  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'progress' | 'fav'>('all');
  const [details, setDetails] = useState<Exam | null>(null);
  const [favs, setFavs] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const toggleFav = (id: string) =>
    setFavs((f) => {
      const n = new Set(f);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify([...n]));
      } catch {}
      return n;
    });
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const activeId = useActiveExamId();
  const qs = useMemo(() => questionStats(attempts ?? []), [attempts]);
  const [sel, setSelRaw] = useState<string>(() => {
    try {
      return localStorage.getItem(SEL_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const setSel = (v: string) => {
    setSelRaw(v);
    try {
      localStorage.setItem(SEL_KEY, v);
    } catch {}
  };
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!exams || !attempts || !reviews || !settings) return <div className="text-sm">Loading…</div>;
  const byExam = new Map<string, Attempt[]>();
  for (const a of attempts) if (a.examId) (byExam.get(a.examId) ?? byExam.set(a.examId, []).get(a.examId)!).push(a);
  const active = attempts.filter((a) => a.status === 'active').sort((x, y) => y.updatedAt - x.updatedAt);
  const bank = buildMissedBank(attempts, reviews);
  const missedByExam = new Map<string, number>();
  for (const r of bank) if (r.why.includes('wrong') && r.schedule.status !== 'Mastered') missedByExam.set(r.examId, (missedByExam.get(r.examId) ?? 0) + 1);
  const backupAge = settings.lastBackupAt ? daysAgo(settings.lastBackupAt, now) : null;
  const hasHistory = attempts.some((a) => a.status === 'completed');

  const cats = [...new Set(exams.map(catOf))].sort((a, b) => (a === UNSORTED ? 1 : b === UNSORTED ? -1 : a.localeCompare(b)));
  const current = sel && cats.includes(sel) ? sel : '';
  const shown = exams.filter((e) => !current || catOf(e) === current).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const info = (e: Exam) => {
    const list = (byExam.get(e.id) ?? []).sort((x, y) => (y.completedAt ?? y.updatedAt) - (x.completedAt ?? x.updatedAt));
    const done = list.filter((a) => a.status === 'completed');
    return { done, open: list.find((a) => a.status === 'active'), last: done[0] };
  };

  const backup = async () => {
    setBusy('Preparing backup…');
    try {
      downloadBlob(await exportBackup(), backupFileName());
      setBusy('Backup saved to your Downloads folder.');
    } catch (e) {
      setBusy('Backup failed: ' + String(e));
    }
  };

  const q = search.trim().toLowerCase();
  const desk = exams.find((e) => e.id === activeId) ?? exams.find((e) => !e.isDemo) ?? exams[0];
  const initials = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase() + (w.length > 1 && /[a-z]/.test(w[1]!) ? w[1] : '')).join('').slice(0, 2) || '?';
  const tint = (n: string) => BADGE[[...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % BADGE.length];
  const inTab = (e: Exam) => (tab === 'progress' ? !!info(e).open || progressOf(e.questions.map((x) => x.id), qs).completedPct > 0 : tab === 'fav' ? favs.has(e.id) : true);
  const listedAll = exams.filter((e) => inTab(e) && (!q || e.name.toLowerCase().includes(q) || catOf(e).toLowerCase().includes(q)));
  const listed = shown.filter((e) => inTab(e) && (!q || e.name.toLowerCase().includes(q) || catOf(e).toLowerCase().includes(q)));
  const counts = { all: exams.length, progress: exams.filter((e) => !!info(e).open || progressOf(e.questions.map((x) => x.id), qs).completedPct > 0).length, fav: exams.filter((e) => favs.has(e.id)).length };
  const byFolder = cats.map((c) => ({ c, list: listed.filter((e) => catOf(e) === c) })).filter((g) => g.list.length);

  const Badge = ({ e, size = 40 }: { e: Exam; size?: number }) => (
    <div className="serif flex shrink-0 items-center justify-center font-bold text-white" style={{ width: size, height: size, background: e.id === desk?.id ? 'var(--navy)' : tint(e.name), color: e.id === desk?.id ? 'var(--bg)' : '#fff', fontSize: size * 0.36 }}>
      {initials(e.name)}
    </div>
  );
  const Progress = ({ e }: { e: Exam }) => {
    const pr = progressOf(e.questions.map((x) => x.id), qs);
    return (
      <div className="w-[150px] shrink-0">
        <div className="h-1.5" style={{ background: 'var(--line)' }}>
          <div className="h-full" style={{ width: `${pr.completedPct}%`, background: 'var(--brand)' }} />
        </div>
        <div className="mono mt-1 text-[11px]" style={{ color: 'var(--ink-2)' }}>
          {pr.completedPct > 0 ? `${Math.round(pr.completedPct)}% done · ${pr.accuracy == null ? '—' : Math.round(pr.accuracy)}% correct` : 'Not started'}
        </div>
      </div>
    );
  };

  const ExamRow = ({ e }: { e: Exam }) => {
    const { open } = info(e);
    const isDesk = desk?.id === e.id;
    return (
      <div className="flex items-center gap-4 border-b px-2 py-3.5 last:border-b-0" style={{ borderColor: 'var(--line)', background: isDesk ? 'var(--surface-2)' : undefined }} data-testid={`exam-row-${e.id}`}>
        <button className="flex min-w-0 flex-1 items-center gap-4 text-left" onClick={() => setDetails(e)} aria-label={`${e.name}: details`} data-testid="exam-details">
          <Badge e={e} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="serif truncate text-[16px] font-bold" style={{ color: 'var(--ink)' }}>{e.name}</span>
              {isDesk && <span className="mono shrink-0 text-[10px] font-bold uppercase tracking-[0.5px]" style={{ color: 'var(--brand)' }}>● On your desk</span>}
            </span>
            <span className="block truncate text-[14px]" style={{ color: 'var(--ink)' }}>{catOf(e)}</span>
            <span className="mono block text-[11px]" style={{ color: 'var(--ink-2)' }}>
              {e.questions.length.toLocaleString()} questions · {e.pageCount} pages{open ? ' · test in progress' : ''}
              {!e.keyChecked && <span className="ml-2" style={{ color: 'var(--warn)' }}>· check the answer key</span>}
            </span>
          </span>
        </button>
        <span className="hidden sm:block"><Progress e={e} /></span>
        <button className="p-1" title={favs.has(e.id) ? 'Remove from favorites' : 'Add to favorites'} aria-label={favs.has(e.id) ? `Remove ${e.name} from favorites` : `Add ${e.name} to favorites`} aria-pressed={favs.has(e.id)} onClick={() => toggleFav(e.id)} data-testid="fav" style={{ color: favs.has(e.id) ? 'var(--brand)' : 'var(--ink-3)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={favs.has(e.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
        </button>
        {isDesk ? (
          <a className="btn-accent btn-sm whitespace-nowrap" href={open ? `#/test/${open.id}` : `#/setup?exam=${e.id}`} data-testid={open ? 'resume-block' : 'new-attempt'} aria-label={`Continue ${e.name}`}>Continue →</a>
        ) : (
          <button className="btn-primary btn-sm" onClick={() => setActiveExam(e.id)} data-testid="select-exam" aria-label={`Select ${e.name}`}>Select</button>
        )}
      </div>
    );
  };

  return (
    <div data-testid="home">
      {folder.needsPermission && (
        <div className="mb-4 flex flex-wrap items-center gap-3 border-2 p-3 text-sm" style={{ borderColor: 'var(--warn)', background: 'var(--surface)' }} data-testid="folder-reconnect">
          Your Test Simulator folder “{folder.name}” needs permission again after a restart.
          <button className="btn-primary" onClick={() => void reconnectFolder()}>Reconnect folder</button>
        </div>
      )}
      {active.filter((a) => !a.examId).length > 0 && (
        <div className="card mb-4 p-3 text-sm" data-testid="resume-card">
          <b>Unfinished quizzes:</b>
          {active
            .filter((a) => !a.examId)
            .slice(0, 4)
            .map((a) => (
              <span key={a.id} className="ml-3 inline-flex items-center gap-2">
                {a.name} ({a.items.filter((i) => i.answer).length}/{a.items.length})
                <button className="btn-primary btn-sm" onClick={() => go(`/test/${a.id}`)}>Resume</button>
                <button className="btn btn-sm" onClick={() => window.confirm(`Discard “${a.name}”?`) && void deleteAttempt(a.id)}>Discard</button>
              </span>
            ))}
        </div>
      )}

      <H1 rule sub="Every exam on the shelf, arranged by folder." right={<><a href="#/import?folder=1" className="btn">Import a folder</a><a href="#/import" className="btn-primary" data-testid="import-link">+ Import an exam</a></>}>
        Exam Library
      </H1>

      {exams.length === 0 ? (
        <div className="card flex flex-col items-center p-10 text-center text-sm">
          <div className="serif mb-1 text-lg font-bold" style={{ color: 'var(--ink)' }}>Your library is empty</div>
          <p className="max-w-md" style={{ color: 'var(--ink-2)' }}>No exams yet. <a className="link" href="#/import?folder=1">Import your folder of practice exams</a> (one subfolder per subject), or <a className="link" href="#/import">import one exam</a>. The demo exam can be added again from <a className="link" href="#/settings">Settings</a>.</p>
        </div>
      ) : (
        <>
          {desk && (() => {
            const d = info(desk);
            return (
              <section className="mb-8 flex flex-wrap items-center gap-5 border-2 p-5" style={{ borderColor: 'var(--rule)', background: 'var(--surface-2)' }} data-testid="on-desk">
                <div className="min-w-0 flex-1">
                  <div className="mono mb-2 text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: 'var(--brand)' }}>On your desk</div>
                  <div className="flex items-center gap-3">
                    <Badge e={desk} size={44} />
                    <div className="min-w-0">
                      <div className="serif truncate text-[22px] font-bold leading-tight">{desk.name}</div>
                      <div className="text-[14px]" style={{ color: 'var(--ink)' }}>{catOf(desk)}</div>
                      <div className="mono text-[11px]" style={{ color: 'var(--ink-2)' }}>{desk.questions.length.toLocaleString()} questions · {desk.pageCount} pages</div>
                    </div>
                  </div>
                </div>
                <Progress e={desk} />
                <div className="flex gap-2">
                  <button className="btn" onClick={() => setDetails(desk)}>Details</button>
                  {d.open ? <a className="btn-accent" href={`#/test/${d.open.id}`}>Continue →</a> : <a className="btn-accent" href={`#/setup?exam=${desk.id}`}>Continue →</a>}
                </div>
              </section>
            );
          })()}

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <label className="block w-full max-w-[420px]">
              <span className="eyebrow-mono mb-1.5 block">Search the catalogue</span>
              <span className="relative block">
                <input ref={searchRef} className="field w-full pl-9 pr-9" placeholder="Exam name or folder" value={search} onChange={(ev) => setSearch(ev.target.value)} data-testid="exam-search" />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <kbd className="mono absolute right-2.5 top-1/2 -translate-y-1/2 border px-1.5 text-[11px]" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>/</kbd>
              </span>
            </label>
            <div className="flex border-2" style={{ borderColor: 'var(--rule)' }}>
              {([['all', 'All exams'], ['progress', 'In progress'], ['fav', 'Favorites']] as const).map(([k, l]) => (
                <button key={k} className="px-3.5 py-2 text-[14px] font-semibold" style={tab === k ? { background: 'var(--navy)', color: 'var(--bg)' } : { color: 'var(--ink)' }} onClick={() => setTab(k)} data-testid={`exams-tab-${k}`}>
                  {l} <span className="mono ml-1 text-[11px] opacity-80">{counts[k]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-6 md:flex-row">
            <nav className="w-full shrink-0 md:w-[240px]" aria-label="Folders" data-testid="folder-list">
              <button className="mb-0 block w-full p-4 text-left" style={{ background: 'var(--navy)', color: 'var(--bg)' }} onClick={() => setSel('')} data-testid="folder-all">
                <span className="mono block text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: '#d2875c' }}>The catalogue</span>
                <span className="serif block text-[22px] font-bold">{tab === 'all' && !q ? exams.length : `${listedAll.length} of ${exams.length}`} exam{exams.length === 1 ? '' : 's'}</span>
                <span className="mono block text-[11px] opacity-80">{exams.reduce((n, e) => n + e.questions.length, 0).toLocaleString()} questions · {cats.length} folder{cats.length === 1 ? '' : 's'}</span>
              </button>
              {cats.filter((c) => listedAll.some((e) => catOf(e) === c)).map((c) => {
                const list = listedAll.filter((e) => catOf(e) === c);
                const pr = progressOf(list.flatMap((e) => e.questions.map((x) => x.id)), qs);
                const on = current === c;
                return (
                  <div key={c} className="border-b" style={{ borderColor: 'var(--line)' }}>
                    <button className="block w-full border-l-4 px-3 py-2.5 text-left" style={on ? { background: 'var(--surface-2)', borderColor: 'var(--brand)' } : { borderColor: 'transparent' }} onClick={() => setSel(on ? '' : c)} data-testid={`folder-${c}`}>
                      <span className="flex items-center gap-2">
                        <span className="serif truncate text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{c}</span>
                        <span className="mono ml-auto text-[11px]" style={{ color: 'var(--ink-2)' }}>{list.length}</span>
                        <span className="text-[11px]" style={{ color: 'var(--ink-2)' }}>{on ? '⌃' : '⌄'}</span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="block h-1 flex-1" style={{ background: 'var(--line)' }}>
                          <span className="block h-full" style={{ width: `${pr.completedPct}%`, background: 'var(--brand)' }} />
                        </span>
                        <span className="mono text-[10px]" style={{ color: 'var(--ink-2)' }}>{list.reduce((n, e) => n + e.questions.length, 0)} Q</span>
                      </span>
                    </button>
                    {on && (
                      <div className="pb-2 pl-6 pr-3">
                        {list.map((e) => (
                          <a key={e.id} href={`#/exam/${e.id}`} className="flex items-center gap-2 py-1 text-[13px] hover:underline" style={{ color: 'var(--ink)' }}>
                            <span className="h-2.5 w-2.5 shrink-0" style={{ background: tint(e.name) }} />
                            <span className="truncate">{e.name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
            <div className="min-w-0 flex-1" data-testid="library">
              {byFolder.map(({ c, list }) => (
                <section key={c} className="mb-8" data-testid={`group-${c}`}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 border-b-2 pb-2" style={{ borderColor: 'var(--rule)' }}>
                    <h2 className="text-[26px] font-bold">{c}</h2>
                    <span className="mono text-[12px]" style={{ color: 'var(--ink-2)' }}>{list.length} exam{list.length === 1 ? '' : 's'} · {list.reduce((n, e) => n + e.questions.length, 0).toLocaleString()} questions</span>
                  </div>
                  {list.map((e) => (
                    <ExamRow key={e.id} e={e} />
                  ))}
                </section>
              ))}
              {listed.length === 0 && <div className="text-sm" style={{ color: 'var(--ink-3)' }}>{tab === 'fav' && !search ? 'No favorites yet: click the bookmark on an exam.' : `No exams match${search ? ` “${search}”` : ''}.`}</div>}
            </div>
          </div>
        </>
      )}

      {details && (() => {
        const e = details;
        const { done, open, last } = info(e);
        const miss = missedByExam.get(e.id) ?? 0;
        const isDesk = desk?.id === e.id;
        const keyed = e.questions.filter((x) => x.answer).length;
        const explained = e.questions.filter((x) => x.explanation?.trim()).length;
        const tags = new Map<string, number>();
        for (const x of e.questions) for (const t of x.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
        const pr = progressOf(e.questions.map((x) => x.id), qs);
        return (
          <PaperModal
            title={e.name}
            width={880}
            onClose={() => setDetails(null)}
            testId="exam-details-dialog"
            footer={
              <>
                {isDesk ? (
                  <a className="btn-accent" href={open ? `#/test/${open.id}` : `#/setup?exam=${e.id}`}>Continue →</a>
                ) : (
                  <button className="btn-primary" onClick={() => { setActiveExam(e.id); setDetails(null); }} data-testid="details-select">Select</button>
                )}
                <button className="btn" onClick={() => setDetails(null)}>Close</button>
              </>
            }
          >
            <p className="-mt-1 mb-5 text-[14px]" style={{ color: 'var(--ink-2)' }}>
              {catOf(e)} · imported {fmtDate(e.createdAt)}{e.sourceName ? ` from ${e.sourceName}` : ''}
            </p>
            <div className="mb-6 border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
              <div className="mb-3 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Dossier</div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ['Total Questions', e.questions.length.toLocaleString()],
                  ['Pages', String(e.pageCount)],
                  ['Your progress', `${Math.round(pr.completedPct)}% done`],
                  ['Folder', catOf(e)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--ink-2)' }}>{k}</div>
                    <div className="mono truncate text-[18px] font-bold">{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mb-3 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Syllabus Overview</div>
            <div className="mb-6 grid gap-6 sm:grid-cols-2">
              <div>
                <div className="eyebrow mb-2 border-b-2 pb-1" style={{ borderColor: 'var(--line)' }}>Contents</div>
                {[
                  ['Questions with an answer', keyed],
                  ['Questions with an explanation', explained],
                  ['Answered by you', pr.answered],
                  ['Correct', pr.correct],
                  ['Incorrect', pr.incorrect],
                  ['Finished tests', done.length],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between py-1.5 text-[14px] font-semibold"><span>{k}</span><span className="mono font-normal">{v}</span></div>
                ))}
              </div>
              <div>
                <div className="eyebrow mb-2 border-b-2 pb-1" style={{ borderColor: 'var(--line)' }}>Tags</div>
                {tags.size ? (
                  [...tags.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([t, n]) => (
                    <div key={t} className="flex justify-between gap-2 py-1.5 text-[14px] font-semibold"><span className="truncate">{t}</span><span className="mono font-normal">{n}</span></div>
                  ))
                ) : (
                  <div className="py-1.5 text-[13px]" style={{ color: 'var(--ink-3)' }}>No tags yet. Add them on the answer key screen.</div>
                )}
              </div>
            </div>
            <div className="eyebrow mb-2 border-b-2 pb-1" style={{ borderColor: 'var(--line)' }}>Actions</div>
            <div className="flex flex-wrap gap-2" data-testid="details-actions">
              {open ? (
                <>
                  <a className="btn" href={`#/test/${open.id}`} data-testid="details-resume">Resume unfinished test</a>
                  <button className="btn" data-testid="discard-block" onClick={() => window.confirm(`Discard the unfinished test of “${e.name}”? Its answers are deleted.`) && void deleteAttempt(open.id)}>Discard unfinished test</button>
                </>
              ) : (
                <a className="btn" href={`#/setup?exam=${e.id}`}>New test</a>
              )}
              {last && <a className="btn" href={`#/report/${last.id}`}>Latest report</a>}
              {miss > 0 && <a className="btn" href={`#/setup?exam=${e.id}&pick=missed`}>Retake missed ({miss})</a>}
              <a className="btn" href={`#/exam/${e.id}`}>All tests</a>
              <a className="btn" href={`#/exam/${e.id}/key`}>{e.keyChecked ? 'Edit answer key' : 'Check answer key'}</a>
              <button className="btn" onClick={() => { setMove(e); setMoveTo(catOf(e) === UNSORTED ? '' : catOf(e)); setDetails(null); }} data-testid="details-move">Move</button>
              <button className="btn" style={{ color: 'var(--bad)' }} onClick={() => { setDel(e); setDetails(null); }} data-testid="delete-exam">Delete</button>
            </div>
          </PaperModal>
        );
      })()}

      <H2>Your history</H2>
      <div className="card p-4 text-sm" data-testid="backup-status">
        {folder.connected ? (
          <p>
            Saving to your folder <b>{folder.name}</b>
            {folder.lastSyncAt ? ` (last saved ${new Date(folder.lastSyncAt).toLocaleTimeString()})` : ''}. Keep that folder in iCloud Drive, OneDrive, Dropbox or Google Drive and your history is backed up automatically.
            {folder.error && <span className="ml-2 text-red-700">Folder problem: {folder.error}</span>}
          </p>
        ) : (
          <>
            <p className={backupAge == null ? (hasHistory ? 'font-bold text-red-700' : '') : backupAge >= BACKUP_WARN_DAYS ? 'font-bold text-red-700' : ''}>
              Last backup: <span data-testid="last-backup">{backupAge == null ? 'never' : backupAge === 0 ? 'today' : `${backupAge} day${backupAge === 1 ? '' : 's'} ago`}</span>
              {(backupAge != null && backupAge >= BACKUP_WARN_DAYS) || (backupAge == null && hasHistory) ? ': please back up now. Without a backup, clearing browser data or losing this computer loses your history.' : '.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className="btn-primary" onClick={backup} data-testid="backup-now">Back up now</button>
              <a className="btn" href="#/settings">{folder.supported ? 'Save automatically to a folder' : 'Backup and restore options'}</a>
              {busy && <span>{busy}</span>}
            </div>
          </>
        )}
      </div>

      {move && (
        <PaperModal title={`Move “${move.name}” to a folder`} onClose={() => setMove(null)} width={480} footer={<><button className="btn" onClick={() => setMove(null)}>Cancel</button><button className="btn-primary" onClick={async () => { await saveExam({ ...move, subject: moveTo.trim() }); setMove(null); }}>Move</button></>}>
          <div className="flex items-center gap-2">
            Folder
            <FolderPicker value={moveTo} onChange={setMoveTo} testId="move-folder" />
          </div>
        </PaperModal>
      )}
      {del && (
        <PaperModal
          title={`Delete “${del.name}”?`}
          onClose={() => setDel(null)}
          width={520}
          footer={
            <>
              <button className="btn" onClick={() => setDel(null)}>Cancel</button>
              <button className="btn" data-testid="delete-keep-history" onClick={async () => { await deleteExam(del.id, false); setDel(null); }}>Delete exam, keep history</button>
              <button className="btn" style={{ background: 'var(--bad)', borderColor: 'var(--bad)', color: '#fff' }} data-testid="delete-all" onClick={async () => { await deleteExam(del.id, true); setDel(null); }}>Delete exam and history</button>
            </>
          }
        >
          <p>The stored PDF and answer key will be removed from this device.</p>
        </PaperModal>
      )}
    </div>
  );
}
