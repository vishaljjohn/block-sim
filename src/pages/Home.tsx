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
      <path d={open ? 'M3 6h6l2 2h10v2H6l-3 9V6z M6 10h16l-3 9H3z' : 'M3 5h6l2 2h10v12H3z'} fill={open ? '#1c4973' : '#6b7d93'} />
    </svg>
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
      <div className="rounded-lg border border-gray-300 bg-white p-3 shadow-sm" data-testid={`exam-row-${e.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <a className="text-[15px] font-bold text-navy hover:underline" href={`#/exam/${e.id}`}>
              {e.name}
            </a>
            <div className="text-xs text-gray-600">
              {e.questions.length} questions · {done.length} attempt{done.length === 1 ? '' : 's'}
              {last && <> · last {fmtDate(last.completedAt)}</>}
              {!e.keyChecked && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">check the answer key</span>}
            </div>
          </div>
          {s && (
            <div className="text-right">
              <div className="text-lg font-bold" style={{ color: s.pct >= 70 ? '#15803d' : s.pct >= 50 ? '#b45309' : '#b91c1c' }}>{Math.round(s.pct)}%</div>
              <div className="text-[11px] text-gray-500">last score</div>
            </div>
          )}
        </div>
        <div className="my-2">
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
            <div className="h-2 rounded-full bg-gray-100" />
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {open ? (
            <>
              <button className="btn-primary py-0.5" onClick={() => go(`/test/${open.id}`)} data-testid="resume-block">Resume</button>
              <button className="btn py-0.5" data-testid="discard-block" onClick={() => window.confirm(`Discard the unfinished block of “${e.name}”? Its answers are deleted.`) && void deleteAttempt(open.id)}>Discard</button>
            </>
          ) : !e.keyChecked ? (
            <a className="btn-primary py-0.5" href={`#/exam/${e.id}/key`}>Check answer key</a>
          ) : (
            <a className="btn-primary py-0.5" href={`#/setup?exam=${e.id}`} data-testid="new-attempt">{done.length ? 'New attempt' : 'Start'}</a>
          )}
          {last && <a className="btn py-0.5" href={`#/report/${last.id}`}>Results</a>}
          {last && <a className="btn py-0.5" href={`#/review/${last.id}`}>Review</a>}
          {miss > 0 && <a className="btn py-0.5" href={`#/setup?exam=${e.id}&pick=missed`}>Retake missed ({miss})</a>}
          <a className="btn py-0.5" href={`#/exam/${e.id}/key`}>Edit</a>
          <button className="btn py-0.5" onClick={() => { setMove(e); setMoveTo(catOf(e) === UNSORTED ? '' : catOf(e)); }}>Move</button>
          <button className="btn py-0.5" onClick={() => setDel(e)} data-testid="delete-exam">Delete</button>
        </div>
      </div>
    );
  };

  return (
    <div data-testid="home">
      {folder.needsPermission && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded border border-yellow-600 bg-yellow-50 p-2 text-sm" data-testid="folder-reconnect">
          Your Test Simulator folder “{folder.name}” needs permission again after a restart.
          <button className="btn-primary" onClick={() => void reconnectFolder()}>Reconnect folder</button>
        </div>
      )}
      {due.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-navy p-3" style={{ background: '#e6edf5' }} data-testid="due-card">
          <div>
            <div className="font-bold">Due for review</div>
            <div className="text-sm">
              <span data-testid="due-count">{due.length}</span> missed question{due.length === 1 ? ' is' : 's are'} due for a redo today.
            </div>
          </div>
          <button className="btn-primary" data-testid="due-start" onClick={() => go(`/redo?q=${due.slice(0, 40).map((r) => encodeURIComponent(r.qid)).join(',')}`)}>
            Start review ({Math.min(due.length, 40)})
          </button>
        </div>
      )}
      {active.filter((a) => !a.examId).length > 0 && (
        <div className="mb-3 rounded border border-gray-400 bg-gray-50 p-2 text-sm" data-testid="resume-card">
          <b>Unfinished quizzes:</b>
          {active
            .filter((a) => !a.examId)
            .slice(0, 4)
            .map((a) => (
              <span key={a.id} className="ml-3 inline-flex items-center gap-2">
                {a.name} ({a.items.filter((i) => i.answer).length}/{a.items.length})
                <button className="btn-primary py-0.5" onClick={() => go(`/test/${a.id}`)}>Resume</button>
                <button className="btn py-0.5" onClick={() => window.confirm(`Discard “${a.name}”?`) && void deleteAttempt(a.id)}>Discard</button>
              </span>
            ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Library</h1>
        <div className="flex gap-2">
          <a href="#/import" className="btn-primary" data-testid="import-link">+ Import an exam</a>
          <a href="#/import?folder=1" className="btn">+ Import a folder</a>
        </div>
      </div>

      {exams.length === 0 ? (
        <div className="rounded-lg border border-gray-300 bg-white p-6 text-sm">
          No exams yet. <a className="link" href="#/import?folder=1">Import your folder of practice exams</a> (one subfolder per subject), or <a className="link" href="#/import">import one exam</a>. The demo exam can be added again from <a className="link" href="#/settings">Settings</a>.
        </div>
      ) : (
        <div className="flex flex-col gap-4 md:flex-row">
          <nav className="w-full shrink-0 md:w-52" aria-label="Folders" data-testid="folder-list">
            <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm" style={{ background: !current ? '#1c4973' : undefined, color: !current ? '#fff' : undefined }} onClick={() => setSel('')} data-testid="folder-all">
              <FolderIcon open={!current} /> All exams <span className="ml-auto text-xs opacity-80">{exams.length}</span>
            </button>
            {cats.map((c) => {
              const list = exams.filter((e) => catOf(e) === c);
              const doneN = list.filter((e) => info(e).done.length).length;
              return (
                <button key={c} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm" style={{ background: current === c ? '#1c4973' : undefined, color: current === c ? '#fff' : undefined }} onClick={() => setSel(c)} data-testid={`folder-${c}`}>
                  <FolderIcon open={current === c} /> <span className="truncate">{c}</span>
                  <span className="ml-auto text-xs opacity-80" title={`${doneN} of ${list.length} completed`}>
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
                    <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-600">
                      {g.title} <span className="font-normal">({g.list.length})</span>
                    </h2>
                    <div className="grid gap-3 lg:grid-cols-2">
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
      <div className="text-sm" data-testid="backup-status">
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
          <label className="mb-3 block">
            Folder
            <input className="field ml-2 w-56" list="lib-folders" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} autoFocus />
            <datalist id="lib-folders">
              {cats.filter((c) => c !== UNSORTED).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
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
