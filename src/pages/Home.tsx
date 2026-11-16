import { useState } from 'react';
import { BACKUP_WARN_DAYS } from '../config';
import { db } from '../db';
import type { Attempt, Exam } from '../types';
import { buildMissedBank, dueRows } from '../lib/missed';
import { scoreAttempt } from '../lib/score';
import { deleteAttempt, deleteExam, getSettings } from '../lib/store';
import { folderStatus, onFolderStatus, reconnectFolder } from '../lib/folder';
import { exportBackup } from '../lib/backup';
import { downloadBlob } from '../lib/csv';
import { daysAgo, fmtDate, go, useLive } from '../ui/hooks';
import { H1, H2 } from '../ui/Shell';
import { Modal } from '../ui/panels';
import { useEffect, useSyncExternalStore } from 'react';

export function useFolderStatus() {
  return useSyncExternalStore(onFolderStatus, folderStatus);
}

export function backupFileName(): string {
  return `block-sim-backup-${new Date().toISOString().slice(0, 10)}.zip`;
}

export function Home() {
  const exams = useLive(() => db.exams.orderBy('updatedAt').reverse().toArray(), []);
  const attempts = useLive(() => db.attempts.toArray(), []);
  const reviews = useLive(() => db.reviews.toArray(), []);
  const settings = useLive(() => getSettings(), []);
  const folder = useFolderStatus();
  const [del, setDel] = useState<Exam | null>(null);
  const [busy, setBusy] = useState('');
  const [now, setNow] = useState(Date.now());
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

  const backup = async () => {
    setBusy('Preparing backup…');
    try {
      downloadBlob(await exportBackup(), backupFileName());
      setBusy('Backup saved to your Downloads folder.');
    } catch (e) {
      setBusy('Backup failed: ' + String(e));
    }
  };

  return (
    <div data-testid="home">
      {folder.needsPermission && (
        <div className="mb-3 flex flex-wrap items-center gap-3 border border-yellow-600 bg-yellow-50 p-2 text-sm" data-testid="folder-reconnect">
          Your data folder “{folder.name}” needs permission again after a restart.
          <button className="btn-primary" onClick={() => void reconnectFolder()}>Reconnect data folder</button>
        </div>
      )}
      {due.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-2 border-navy p-3" style={{ background: '#d6dbe8' }} data-testid="due-card">
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
      {active.length > 0 && (
        <div className="mb-3 border border-gray-500 bg-gray-50 p-2 text-sm" data-testid="resume-card">
          <b>Unfinished block{active.length > 1 ? 's' : ''}:</b>
          {active.slice(0, 4).map((a) => (
            <span key={a.id} className="ml-3 inline-flex items-center gap-2">
              {a.name} ({a.items.filter((i) => i.answer).length}/{a.items.length} answered)
              <button className="btn-primary py-0.5" onClick={() => go(`/test/${a.id}`)} data-testid="resume-block">Resume</button>
              <button className="btn py-0.5" data-testid="discard-block" onClick={() => window.confirm(`Discard the unfinished block “${a.name}”? Its answers are deleted and it will not count in your history.`) && void deleteAttempt(a.id)}>Discard</button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <H1>Library</H1>
        <a href="#/import" className="btn-primary" data-testid="import-link">+ Import a PDF exam</a>
      </div>
      {exams.length === 0 ? (
        <div className="border border-gray-400 p-4 text-sm">
          No exams yet. <a className="link" href="#/import">Import a question PDF</a> to get started, or restore the demo exam from <a className="link" href="#/settings">Settings</a>.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-400" data-testid="library">
            <thead>
              <tr>
                <th className="th">Exam</th>
                <th className="th">Questions</th>
                <th className="th">Attempts</th>
                <th className="th">Last score</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((e) => {
                const list = (byExam.get(e.id) ?? []).sort((x, y) => (y.completedAt ?? y.updatedAt) - (x.completedAt ?? x.updatedAt));
                const done = list.filter((a) => a.status === 'completed');
                const open = list.find((a) => a.status === 'active');
                const last = done[0];
                const miss = missedByExam.get(e.id) ?? 0;
                return (
                  <tr key={e.id} data-testid={`exam-row-${e.id}`}>
                    <td className="td">
                      <a className="link font-bold" href={`#/exam/${e.id}`}>{e.name}</a>
                      <div className="text-xs text-gray-600">
                        {e.subject && <>{e.subject} · </>}added {fmtDate(e.createdAt)}
                        {!e.keyChecked && <span className="ml-2 bg-yellow-200 px-1 text-black">answer key not checked yet</span>}
                      </div>
                    </td>
                    <td className="td">{e.questions.length}</td>
                    <td className="td">{done.length}</td>
                    <td className="td">{last ? `${Math.round(scoreAttempt(last).pct)}% · ${fmtDate(last.completedAt)}` : '—'}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {!e.keyChecked ? (
                          <a className="btn-primary py-0.5" href={`#/exam/${e.id}/key`}>Check answer key</a>
                        ) : (
                          <a className="btn-primary py-0.5" href={`#/setup?exam=${e.id}`} data-testid="new-attempt">New attempt</a>
                        )}
                        {open && <a className="btn py-0.5" href={`#/test/${open.id}`}>Resume</a>}
                        {last && <a className="btn py-0.5" href={`#/review/${last.id}`}>Review</a>}
                        {miss > 0 && <a className="btn py-0.5" href={`#/setup?exam=${e.id}&pick=missed`}>Retake missed ({miss})</a>}
                        <a className="btn py-0.5" href={`#/exam/${e.id}/key`}>Edit</a>
                        <button className="btn py-0.5" onClick={() => setDel(e)} data-testid="delete-exam">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <H2>Your history is stored on this device</H2>
      <div className="text-sm" data-testid="backup-status">
        {folder.connected ? (
          <p>
            Saving to your data folder <b>{folder.name}</b>
            {folder.lastSyncAt ? ` (last saved ${new Date(folder.lastSyncAt).toLocaleTimeString()})` : ''}. Put that folder in iCloud Drive, OneDrive, Dropbox or Google Drive and your history is backed up automatically.
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
              <a className="btn" href="#/settings">{folder.supported ? 'Choose a data folder (automatic saving)' : 'Backup and restore options'}</a>
              {busy && <span>{busy}</span>}
            </div>
          </>
        )}
      </div>

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
