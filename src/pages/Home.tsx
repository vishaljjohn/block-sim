import { useEffect, useState, useSyncExternalStore } from 'react';
import { BACKUP_WARN_DAYS, STORAGE_PREFIX } from '../config';
import { db } from '../db';
import type { Attempt, Exam } from '../types';
import { buildMissedBank, dueRows } from '../lib/missed';
import { scoreAttempt } from '../lib/score';
import { deleteAttempt, deleteExam, getSettings, saveExam } from '../lib/store';
import { folderStatus, onFolderStatus, reconnectFolder } from '../lib/folder';
import { exportBackup } from '../lib/backup';
import { downloadBlob } from '../lib/csv';
import { daysAgo, fmtDate, go, useLive } from '../ui/hooks';
import { H2 } from '../ui/Shell';
import { Modal } from '../ui/panels';
import { ScoreBar } from '../ui/ScoreBar';
import { FolderPicker } from '../ui/FolderPicker';

export function useFolderStatus() {
  return useSyncExternalStore(onFolderStatus, folderStatus);
}

export function backupFileName(): string {
  return `test-simulator-backup-${new Date().toISOString().slice(0, 10)}.zip`;
}

const SEL_KEY = STORAGE_PREFIX + 'library-folder';
const UNSORTED = 'Unsorted';
const catOf = (e: Exam) => e.subject?.trim() || UNSORTED;

function FolderIcon({ open }: { open?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d={open ? 'M3 6h6l2 2h10v2H6l-3 9V6z M6 10h16l-3 9H3z' : 'M3 5h6l2 2h10v12H3z'} fill="currentColor" opacity={open ? 1 : 0.55} />
    </svg>
  );
}

function Stats({ exams, attempts, due }: { exams: Exam[]; attempts: Attempt[]; due: number }) {
  const done = attempts.filter((a) => a.status === 'completed');
  const scores = done.map((a) => scoreAttempt(a));
  const answered = scores.reduce((n, s) => n + s.total - s.blank, 0);
  const correct = scores.reduce((n, s) => n + s.correct, 0);
  const tiles = [
    { label: 'Exams', value: String(exams.length), sub: `${new Set(exams.map(catOf)).size} folder${new Set(exams.map(catOf)).size === 1 ? '' : 's'}` },
    { label: 'Blocks finished', value: String(done.length), sub: `${scores.reduce((n, s) => n + s.total, 0)} questions` },
    { label: 'Average score', value: answered ? `${Math.round((correct / Math.max(1, scores.reduce((n, s) => n + s.total, 0))) * 100)}%` : '—', sub: answered ? `${correct} correct` : 'finish a block to see it' },
    { label: 'Due for review', value: String(due), sub: due ? 'missed questions to redo' : 'all caught up' },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="stats">
      {tiles.map((t) => (
        <div key={t.label} className="card p-4">
          <div className="eyebrow">{t.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight" style={{ color: 'var(--ink)' }}>{t.value}</div>
          <div className="muted mt-0.5 text-xs">{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

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
  const due = dueRows(bank, now);
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
  const groups = [
    { id: 'progress', title: 'In progress', list: shown.filter((e) => info(e).open) },
    { id: 'new', title: 'Not started', list: shown.filter((e) => !info(e).open && !info(e).done.length) },
    { id: 'done', title: 'Completed', list: shown.filter((e) => !info(e).open && info(e).done.length) },
  ];

  const backup = async () => {
    setBusy('Preparing backup…');
    try {
      downloadBlob(await exportBackup(), backupFileName());
      setBusy('Backup saved to your Downloads folder.');
    } catch (e) {
      setBusy('Backup failed: ' + String(e));
    }
  };

  const ExamCard = ({ e }: { e: Exam }) => {
    const { done, open, last } = info(e);
    const s = last ? scoreAttempt(last) : null;
    const miss = missedByExam.get(e.id) ?? 0;
    const answered = open ? open.items.filter((i) => i.answer).length : 0;
    return (
      <div className="card card-hover flex flex-col p-4" data-testid={`exam-row-${e.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <a className="text-[15px] font-semibold leading-snug hover:underline" style={{ color: 'var(--ink)' }} href={`#/exam/${e.id}`}>
              {e.name}
            </a>
            <div className="muted mt-0.5 text-xs">
              {e.questions.length} questions · {done.length} attempt{done.length === 1 ? '' : 's'}
              {last && <> · last {fmtDate(last.completedAt)}</>}
              {!e.keyChecked && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">check the answer key</span>}
            </div>
          </div>
          {s && (
            <div className="rounded-xl px-2.5 py-1 text-right" style={{ background: s.pct >= 70 ? 'rgb(22 163 74 / 0.1)' : s.pct >= 50 ? 'rgb(217 119 6 / 0.12)' : 'rgb(220 38 38 / 0.1)' }}>
              <div className="text-lg font-bold leading-tight tabular-nums" style={{ color: s.pct >= 70 ? 'var(--good)' : s.pct >= 50 ? 'var(--warn)' : 'var(--bad)' }}>{Math.round(s.pct)}%</div>
              <div className="muted text-[10px] font-medium uppercase tracking-wide">last score</div>
            </div>
          )}
        </div>
        <div className="my-3">
          {open ? (
            <>
              <ScoreBar correct={answered} wrong={0} blank={open.items.length - answered} testId="progress-bar" />
              <div className="mt-0.5 text-[11px] text-gray-600">
                {answered} of {open.items.length} answered
              </div>
            </>
          ) : s ? (
            <>
              <ScoreBar correct={s.correct} wrong={s.wrong} blank={s.blank} testId="score-bar" />
              <div className="mt-0.5 flex gap-3 text-[11px] text-gray-600">
                <span className="text-green-700">{s.correct} correct</span>
                <span className="text-red-700">{s.wrong} incorrect</span>
                <span>{s.blank} omitted</span>
              </div>
            </>
          ) : (
            <div className="h-2 rounded-full" style={{ background: 'var(--line)' }} />
          )}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          {open ? (
            <>
              <button className="btn-primary btn-sm" onClick={() => go(`/test/${open.id}`)} data-testid="resume-block">Resume</button>
              <button className="btn btn-sm" data-testid="discard-block" onClick={() => window.confirm(`Discard the unfinished block of “${e.name}”? Its answers are deleted.`) && void deleteAttempt(open.id)}>Discard</button>
            </>
          ) : !e.keyChecked ? (
            <a className="btn-primary btn-sm" href={`#/exam/${e.id}/key`}>Check answer key</a>
          ) : (
            <a className="btn-primary btn-sm" href={`#/setup?exam=${e.id}`} data-testid="new-attempt">{done.length ? 'New attempt' : 'Start'}</a>
          )}
          {last && <a className="btn btn-sm" href={`#/report/${last.id}`}>Results</a>}
          {last && <a className="btn btn-sm" href={`#/review/${last.id}`}>Review</a>}
          {miss > 0 && <a className="btn btn-sm" href={`#/setup?exam=${e.id}&pick=missed`}>Retake missed ({miss})</a>}
          <span className="ml-auto" />
          <a className="btn btn-sm btn-quiet" href={`#/exam/${e.id}/key`}>Edit</a>
          <button className="btn btn-sm btn-quiet" onClick={() => { setMove(e); setMoveTo(catOf(e) === UNSORTED ? '' : catOf(e)); }}>Move</button>
          <button className="btn btn-sm btn-quiet" onClick={() => setDel(e)} data-testid="delete-exam">Delete</button>
        </div>
      </div>
    );
  };

  return (
    <div data-testid="home">
      {folder.needsPermission && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-yellow-50 p-3 text-sm" data-testid="folder-reconnect">
          Your Test Simulator folder “{folder.name}” needs permission again after a restart.
          <button className="btn-primary" onClick={() => void reconnectFolder()}>Reconnect folder</button>
        </div>
      )}
      {due.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(120deg, #2f5be7, #1e3a8a)', boxShadow: 'var(--shadow-lg)' }} data-testid="due-card">
          <div>
            <div className="text-base font-semibold">Due for review</div>
            <div className="text-sm">
              <span data-testid="due-count">{due.length}</span> missed question{due.length === 1 ? ' is' : 's are'} due for a redo today.
            </div>
          </div>
          <button className="btn" style={{ background: '#fff', color: '#1e3a8a', borderColor: '#fff' }} data-testid="due-start" onClick={() => go(`/redo?q=${due.slice(0, 40).map((r) => encodeURIComponent(r.qid)).join(',')}`)}>
            Start review ({Math.min(due.length, 40)})
          </button>
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

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Your practice</div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Library</h1>
        </div>
        <div className="flex gap-2">
          <a href="#/import?folder=1" className="btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 6h6l2 2h10v11H3z" /></svg>
            Import a folder
          </a>
          <a href="#/import" className="btn-primary" data-testid="import-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Import an exam
          </a>
        </div>
      </div>
      {exams.length > 0 && <Stats exams={exams} attempts={attempts} due={due.length} />}

      {exams.length === 0 ? (
        <div className="card flex flex-col items-center p-10 text-center text-sm">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.4" aria-hidden="true" className="mb-3"><path d="M3 6h6l2 2h10v11H3z" /><path d="M12 11v5M9.5 13.5h5" /></svg>
          <div className="mb-1 text-lg font-semibold" style={{ color: 'var(--ink)' }}>Your library is empty</div>
          <p className="muted max-w-md">No exams yet. <a className="link" href="#/import?folder=1">Import your folder of practice exams</a> (one subfolder per subject), or <a className="link" href="#/import">import one exam</a>. The demo exam can be added again from <a className="link" href="#/settings">Settings</a>.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 md:flex-row">
          <nav className="w-full shrink-0 md:w-52" aria-label="Folders" data-testid="folder-list">
            <div className="eyebrow mb-2 px-2.5">Folders</div>
            <button className="mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors" style={!current ? { background: 'var(--brand-soft)', color: 'var(--brand)' } : { color: 'var(--ink-2)' }} onClick={() => setSel('')} data-testid="folder-all">
              <FolderIcon open={!current} /> All exams <span className="ml-auto rounded-full px-1.5 text-[11px] tabular-nums opacity-80">{exams.length}</span>
            </button>
            {cats.map((c) => {
              const list = exams.filter((e) => catOf(e) === c);
              const doneN = list.filter((e) => info(e).done.length).length;
              return (
                <button key={c} className="mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors" style={current === c ? { background: 'var(--brand-soft)', color: 'var(--brand)' } : { color: 'var(--ink-2)' }} onClick={() => setSel(c)} data-testid={`folder-${c}`}>
                  <FolderIcon open={current === c} /> <span className="truncate">{c}</span>
                  <span className="ml-auto rounded-full px-1.5 text-[11px] tabular-nums opacity-80" title={`${doneN} of ${list.length} completed`}>
                    {doneN}/{list.length}
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="min-w-0 flex-1" data-testid="library">
            {groups.map(
              (g) =>
                g.list.length > 0 && (
                  <section key={g.id} className="mb-5" data-testid={`group-${g.id}`}>
                    <h2 className="eyebrow mb-3 flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: g.id === 'progress' ? '#f59e0b' : g.id === 'done' ? 'var(--good)' : 'var(--line-strong)' }} />
                      {g.title} <span className="font-normal">({g.list.length})</span>
                    </h2>
                    <div className="grid gap-4 lg:grid-cols-2">
                      {g.list.map((e) => (
                        <ExamCard key={e.id} e={e} />
                      ))}
                    </div>
                  </section>
                ),
            )}
          </div>
        </div>
      )}

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
        <Modal title={`Move “${move.name}” to a folder`} onClose={() => setMove(null)}>
          <div className="mb-3 flex items-center gap-2">
            Folder
            <FolderPicker value={moveTo} onChange={setMoveTo} testId="move-folder" />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setMove(null)}>Cancel</button>
            <button className="btn-primary" onClick={async () => { await saveExam({ ...move, subject: moveTo.trim() }); setMove(null); }}>Move</button>
          </div>
        </Modal>
      )}
      {del && (
        <Modal title={`Delete “${del.name}”?`} onClose={() => setDel(null)}>
          <p className="mb-3">The stored PDF and answer key will be removed from this device.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn" onClick={() => setDel(null)}>Cancel</button>
            <button className="btn" data-testid="delete-keep-history" onClick={async () => { await deleteExam(del.id, false); setDel(null); }}>
              Delete exam, keep my attempt history
            </button>
            <button className="btn-danger" data-testid="delete-all" onClick={async () => { await deleteExam(del.id, true); setDel(null); }}>
              Delete exam and its history
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
