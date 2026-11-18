import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BACKUP_WARN_DAYS, STORAGE_PREFIX } from '../config';
import { db } from '../db';
import type { Attempt, Exam } from '../types';
import { buildMissedBank } from '../lib/missed';
import { setActiveExam, useActiveExamId } from '../lib/activeExam';
import { progressOf, questionStats } from '../lib/stats';
import { scoreAttempt } from '../lib/score';
import { deleteAttempt, deleteExam, getSettings, saveExam } from '../lib/store';
import { folderStatus, onFolderStatus, reconnectFolder } from '../lib/folder';
import { exportBackup } from '../lib/backup';
import { downloadBlob } from '../lib/csv';
import { daysAgo, fmtDate, go, useLive } from '../ui/hooks';
import { H1, H2 } from '../ui/Shell';
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

  const q = search.trim().toLowerCase();
  const listed = shown.filter((e) => !q || e.name.toLowerCase().includes(q) || catOf(e).toLowerCase().includes(q));
  const desk = exams.find((e) => e.id === activeId) ?? exams.find((e) => !e.isDemo) ?? exams[0];
  const initials = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

  const ExamRow = ({ e }: { e: Exam }) => {
    const { done, open, last } = info(e);
    const pr = progressOf(e.questions.map((x) => x.id), qs);
    const s = last ? scoreAttempt(last) : null;
    const miss = missedByExam.get(e.id) ?? 0;
    const answered = open ? open.items.filter((i) => i.answer).length : 0;
    const isActive = desk?.id === e.id;
    return (
      <div className="flex flex-wrap items-center gap-4 border-b px-5 py-4 last:border-b-0" style={{ borderColor: 'var(--line)', background: isActive ? 'var(--surface-2)' : undefined }} data-testid={`exam-row-${e.id}`}>
        <div className="mono flex h-11 w-11 shrink-0 items-center justify-center text-[13px] font-bold" style={{ background: isActive ? 'var(--navy)' : 'var(--surface-2)', color: isActive ? '#fff' : 'var(--ink)', border: '1.5px solid var(--rule)' }}>
          {initials(e.name)}
        </div>
        <div className="min-w-0 flex-1">
          <a className="serif text-[16px] font-bold leading-snug hover:underline" style={{ color: 'var(--ink)' }} href={`#/exam/${e.id}`}>
            {e.name}
          </a>
          <div className="mono mt-0.5 text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
            {catOf(e).toUpperCase()} · {e.questions.length} Q · {Math.round(pr.completedPct)}% done · {pr.accuracy == null ? '—' : `${Math.round(pr.accuracy)}%`} correct
            {done.length > 0 && <> · {done.length} attempt{done.length === 1 ? '' : 's'}</>}
            {last && <> · last {fmtDate(last.completedAt)}</>}
            {!e.keyChecked && <span className="pill ml-2" style={{ color: 'var(--warn)' }}>check the answer key</span>}
          </div>
          <div className="mt-2 max-w-md">
            {open ? (
              <>
                <ScoreBar correct={answered} wrong={0} blank={open.items.length - answered} testId="progress-bar" />
                <div className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-2)' }}>{answered} of {open.items.length} answered</div>
              </>
            ) : s ? (
              <ScoreBar correct={s.correct} wrong={s.wrong} blank={s.blank} testId="score-bar" />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {open ? (
            <>
              <button className="btn-primary btn-sm" onClick={() => go(`/test/${open.id}`)} data-testid="resume-block">Continue</button>
              <button className="btn btn-sm" data-testid="discard-block" onClick={() => window.confirm(`Discard the unfinished block of “${e.name}”? Its answers are deleted.`) && void deleteAttempt(open.id)}>Discard</button>
            </>
          ) : !e.keyChecked ? (
            <a className="btn-primary btn-sm" href={`#/exam/${e.id}/key`}>Check answer key</a>
          ) : (
            <a className="btn-primary btn-sm" href={`#/setup?exam=${e.id}`} data-testid="new-attempt">{done.length ? 'New test' : 'Start'}</a>
          )}
          {!isActive && <button className="btn btn-sm" onClick={() => setActiveExam(e.id)} data-testid="select-exam">Select</button>}
          {last && <a className="btn btn-sm" href={`#/report/${last.id}`}>Results</a>}
          {last && <a className="btn btn-sm" href={`#/review/${last.id}`}>Review</a>}
          {miss > 0 && <a className="btn btn-sm" href={`#/setup?exam=${e.id}&pick=missed`}>Retake missed ({miss})</a>}
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
        <div className="mb-4 flex flex-wrap items-center gap-3 border p-3 text-sm" style={{ borderColor: 'var(--warn)', background: 'var(--surface)' }} data-testid="folder-reconnect">
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <H1 sub="Every exam in your library, by folder.">Exams</H1>
        <div className="flex gap-2">
          <a href="#/import?folder=1" className="btn">Import a folder</a>
          <a href="#/import" className="btn-primary" data-testid="import-link">+ Import an exam</a>
        </div>
      </div>

      {exams.length === 0 ? (
        <div className="card flex flex-col items-center p-10 text-center text-sm">
          <div className="serif mb-1 text-lg font-bold" style={{ color: 'var(--ink)' }}>Your library is empty</div>
          <p className="max-w-md" style={{ color: 'var(--ink-2)' }}>No exams yet. <a className="link" href="#/import?folder=1">Import your folder of practice exams</a> (one subfolder per subject), or <a className="link" href="#/import">import one exam</a>. The demo exam can be added again from <a className="link" href="#/settings">Settings</a>.</p>
        </div>
      ) : (
        <>
          {desk && (() => {
            const d = info(desk);
            const pr = progressOf(desk.questions.map((x) => x.id), qs);
            return (
              <section className="card accent-top mb-6 flex flex-wrap items-center justify-between gap-4 p-6" data-testid="on-desk">
                <div className="min-w-0">
                  <div className="eyebrow mb-1">On your desk</div>
                  <div className="serif text-[22px] font-bold leading-tight">{desk.name}</div>
                  <div className="mono mt-1 text-[12px]" style={{ color: 'var(--ink-2)' }}>
                    {catOf(desk).toUpperCase()} · {desk.questions.length} questions · {Math.round(pr.completedPct)}% done · {pr.accuracy == null ? '—' : `${Math.round(pr.accuracy)}%`} correct
                  </div>
                </div>
                <div className="flex gap-2">
                  <a className="btn" href={`#/exam/${desk.id}`}>Details</a>
                  {d.open ? <a className="btn-primary" href={`#/test/${d.open.id}`}>Continue →</a> : <a className="btn-primary" href={`#/setup?exam=${desk.id}`}>New test →</a>}
                </div>
              </section>
            );
          })()}
          <div className="flex flex-col gap-6 md:flex-row">
            <nav className="w-full shrink-0 md:w-60" aria-label="Folders" data-testid="folder-list">
              <div className="card p-3">
                <div className="rule-label mb-2 px-2">Catalogue</div>
                <button className="mb-0.5 flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm font-medium" style={!current ? { background: 'var(--navy)', color: '#fff' } : { color: 'var(--ink-2)' }} onClick={() => setSel('')} data-testid="folder-all">
                  <FolderIcon open={!current} /> All exams <span className="mono ml-auto text-[11px] opacity-80">{exams.length}</span>
                </button>
                {cats.map((c) => {
                  const list = exams.filter((e) => catOf(e) === c);
                  const pr = progressOf(list.flatMap((e) => e.questions.map((x) => x.id)), qs);
                  return (
                    <button key={c} className="mb-0.5 block w-full px-2.5 py-2 text-left text-sm font-medium" style={current === c ? { background: 'var(--navy)', color: '#fff' } : { color: 'var(--ink-2)' }} onClick={() => setSel(c)} data-testid={`folder-${c}`}>
                      <span className="flex items-center gap-2">
                        <FolderIcon open={current === c} /> <span className="truncate">{c}</span>
                        <span className="mono ml-auto text-[11px] opacity-80">{list.length}</span>
                      </span>
                      <span className="mt-1 block h-1" style={{ background: current === c ? 'rgb(255 255 255 / 0.25)' : 'var(--line)' }}>
                        <span className="block h-full" style={{ width: `${pr.completedPct}%`, background: current === c ? '#fff' : 'var(--brand)' }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>
            <div className="min-w-0 flex-1" data-testid="library">
              <input className="field mb-4 w-full" placeholder="Search exams…" value={search} onChange={(ev) => setSearch(ev.target.value)} data-testid="exam-search" />
              {groups.map((g) => {
                const list = g.list.filter((e) => listed.includes(e));
                return (
                  list.length > 0 && (
                    <section key={g.id} className="mb-6" data-testid={`group-${g.id}`}>
                      <h2 className="rule-label mb-2">
                        {g.title} ({list.length})
                      </h2>
                      <div className="card">
                        {list.map((e) => (
                          <ExamRow key={e.id} e={e} />
                        ))}
                      </div>
                    </section>
                  )
                );
              })}
              {listed.length === 0 && <div className="text-sm" style={{ color: 'var(--ink-3)' }}>No exams match “{search}”.</div>}
            </div>
          </div>
        </>
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
