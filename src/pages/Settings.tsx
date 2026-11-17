import { useEffect, useRef, useState } from 'react';
import { APP_VERSION, BUILD_TIME, CHANNEL } from '../config';
import { db } from '../db';
import { exportBackup, mergeIntoDb, restoreBackup } from '../lib/backup';
import { downloadBlob, downloadText } from '../lib/csv';
import { ensureDemo } from '../lib/demo';
import { debugInfo } from '../lib/errorLog';
import { chooseFolder, disconnectFolder, reconnectFolder, syncNow } from '../lib/folder';
import { getSettings, wipeEverything } from '../lib/store';
import { fmtDateTime, useLive } from '../ui/hooks';
import { H1, H2 } from '../ui/Shell';
import { Modal } from '../ui/panels';
import { DisplaySettings } from '../ui/DisplaySettings';
import { backupFileName, useFolderStatus } from './Home';

function fmtBytes(n: number | undefined): string {
  if (n == null) return 'unknown';
  if (n > 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
  return Math.round(n / 1e3) + ' KB';
}

export function SettingsPage() {
  const folder = useFolderStatus();
  const settings = useLive(() => getSettings(), []);
  const snaps = useLive(() => db.snapshots.orderBy('createdAt').reverse().toArray(), []);
  const counts = useLive(async () => ({ exams: await db.exams.count(), attempts: await db.attempts.count() }), []);
  const [usage, setUsage] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [msg, setMsg] = useState('');
  const [wipe, setWipe] = useState(false);
  const [oneExam, setOneExam] = useState('');
  const examList = useLive(() => db.exams.toArray(), []);
  const [wipeText, setWipeText] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refreshUsage = () => {
    void navigator.storage?.estimate?.().then(setUsage).catch(() => {});
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  };
  useEffect(refreshUsage, []);

  const doBackup = async () => {
    setMsg('Preparing backup…');
    try {
      downloadBlob(await exportBackup(), backupFileName());
      setMsg('Backup saved to your Downloads folder. Keep it somewhere safe (cloud drive, USB stick, email to yourself).');
    } catch (e) {
      setMsg('Backup failed: ' + String(e));
    }
  };

  return (
    <div data-testid="settings">
      <H1>Settings</H1>
      {msg && <div className="mb-3 border border-gray-500 bg-gray-50 p-2 text-sm" role="status" data-testid="settings-msg">{msg}</div>}

      <H2>Display</H2>
      <div className="max-w-md">
        <DisplaySettings />
      </div>

      <H2>Data folder (automatic saving)</H2>
      <div className="text-sm" data-testid="folder-section">
        {!folder.supported ? (
          <p>This browser cannot save to a folder. Use Chrome or Edge on a computer for automatic folder saving. Here, your history is kept in the browser's storage; use “Back up now” regularly.</p>
        ) : folder.connected ? (
          <>
            <p>
              Saving everything to <b data-testid="folder-name">{folder.name}</b>
              {folder.lastSyncAt ? ` · last saved ${fmtDateTime(folder.lastSyncAt)}` : ''}.
            </p>
            {folder.error && <p className="text-red-700">Folder problem: {folder.error}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn" onClick={async () => { await syncNow(); setMsg('Folder is up to date.'); }}>Save and merge now</button>
              <button className="btn" onClick={async () => { if (await chooseFolder()) setMsg('Data folder changed. Existing data was merged.'); }} data-testid="change-folder">Change data folder</button>
              <button className="btn" onClick={() => void disconnectFolder()}>Stop using a folder</button>
            </div>
          </>
        ) : folder.needsPermission ? (
          <>
            <p>The data folder “{folder.name}” needs permission again (browsers ask after a restart).</p>
            <button className="btn-primary mt-2" onClick={() => void reconnectFolder()}>Reconnect data folder</button>
          </>
        ) : (
          <>
            <p>Pick a folder (for example “Test Simulator” inside iCloud Drive, OneDrive, Dropbox or Google Drive). Every exam and attempt is saved there as its own file. On a new computer, pick the same folder and everything comes back.</p>
            <button className="btn-primary mt-2" onClick={async () => { if (await chooseFolder()) setMsg('Data folder connected. Everything is being saved there.'); }} data-testid="choose-folder">Choose a data folder</button>
          </>
        )}
      </div>

      <H2>Backup and restore</H2>
      <div className="text-sm">
        <p>Last backup: {settings?.lastBackupAt ? fmtDateTime(settings.lastBackupAt) : 'never'}. A backup is one file with every exam, PDF, attempt and note.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={doBackup} data-testid="export-all">Export everything (backup file)</button>
          <button className="btn" onClick={() => fileRef.current?.click()} data-testid="restore-btn">Restore from a backup file…</button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            data-testid="restore-file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setMsg('Restoring…');
              try {
                const r = await restoreBackup(f);
                setMsg(`Restored from the backup: ${r.exams} exam(s) and ${r.attempts} attempt(s)${r.pdfs ? `, ${r.pdfs} PDF(s) copied back` : ''}. Nothing on this device was removed.`);
                refreshUsage();
              } catch (er) {
                setMsg('Restore failed: ' + String((er as Error)?.message ?? er) + '. Your current data was not changed.');
              }
            }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span>Export one exam (its PDF, key and attempts):</span>
          <select className="field" value={oneExam} onChange={(e) => setOneExam(e.target.value)} data-testid="export-one-select">
            <option value="">Choose an exam…</option>
            {(examList ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <button
            className="btn"
            disabled={!oneExam}
            data-testid="export-one"
            onClick={async () => {
              const e = examList?.find((x) => x.id === oneExam);
              setMsg('Preparing…');
              downloadBlob(await exportBackup({ examId: oneExam }), `test-simulator-exam-${(e?.name ?? 'exam').replace(/[^\w-]+/g, '_').slice(0, 40)}.zip`);
              setMsg('Exam exported. Restore it on any computer with “Restore from a backup file”.');
            }}
          >
            Export
          </button>
        </div>
        <p className="mt-2 text-gray-700">Restoring never deletes anything: it merges.</p>
      </div>

      <H2>Automatic snapshots</H2>
      <div className="text-sm">
        <p>Test Simulator keeps the last 5 automatic safety copies of your history (answers, notes, keys; not the PDFs).</p>
        {snaps && snaps.length > 0 ? (
          <table className="mt-1 border-collapse border border-gray-400" data-testid="snapshots">
            <tbody>
              {snaps.map((s) => (
                <tr key={s.id}>
                  <td className="td">{fmtDateTime(s.createdAt)}</td>
                  <td className="td">{s.reason}</td>
                  <td className="td">{fmtBytes(s.data.length)}</td>
                  <td className="td">
                    <button
                      className="btn py-0"
                      onClick={async () => {
                        if (!window.confirm('Bring back the answers, notes and keys saved in this snapshot? Nothing is deleted or replaced: anything missing comes back (PDFs are not in snapshots).')) return;
                        const d = JSON.parse(s.data) as { exams: { id: string }[]; attempts: { id: string }[]; reviews: { examId: string }[] };
                        const json = new Map<string, unknown>();
                        d.exams.forEach((x) => json.set(`exams/${x.id}.json`, x));
                        d.attempts.forEach((x) => json.set(`attempts/${x.id}.json`, x));
                        json.set('reviews/all.json', d.reviews);
                        await mergeIntoDb({ json, bin: new Map() }, { resurrect: true });
                        setMsg('Snapshot merged.');
                      }}
                    >
                      Bring back
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-600">No snapshots yet. One is made after each block and once a day.</p>
        )}
      </div>

      <H2>Storage</H2>
      <div className="text-sm" data-testid="storage-usage">
        <p>
          {counts?.exams ?? 0} exams, {counts?.attempts ?? 0} attempts · using {fmtBytes(usage?.usage)} of about {fmtBytes(usage?.quota)} available to this browser.
        </p>
        <p>Protected from automatic clean-up by the browser: <b>{persisted == null ? 'unknown' : persisted ? 'yes' : 'not yet'}</b>{persisted === false && ' (installing the app or using it regularly makes the browser grant this)'}.</p>
      </div>

      <H2>Demo exam</H2>
      <button className="btn" onClick={async () => setMsg((await ensureDemo(true)) ? 'Demo exam added to the Library.' : 'The demo exam is already in the Library.')}>Add the demo exam again</button>

      <H2>About and troubleshooting</H2>
      <div className="text-sm">
        <p data-testid="app-version">
          Test Simulator version {APP_VERSION} ({CHANNEL}) · built {BUILD_TIME.slice(0, 16).replace('T', ' ')}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn" data-testid="export-debug" onClick={async () => downloadText(await debugInfo({ settings, counts, folder: { connected: folder.connected, supported: folder.supported } }), 'test-simulator-debug.json', 'application/json')}>
            Export debug info
          </button>
          <a className="btn" href="#/welcome">Show the welcome screen again</a>
        </div>
        <p className="mt-1 text-gray-700">Debug info contains the version, browser, settings and error log. It never contains question content or PDFs.</p>
      </div>

      <H2>Delete everything</H2>
      <button className="btn-danger" onClick={() => { setWipe(true); setWipeText(''); }} data-testid="wipe">Delete all data on this device…</button>

      {wipe && (
        <Modal title="Delete everything?" onClose={() => setWipe(false)}>
          <p className="mb-2">This removes every exam, PDF, attempt, note and snapshot from this browser. It cannot be undone. {folder.connected ? 'Files in your data folder are not deleted.' : 'Export a backup first if you might want it back.'}</p>
          <label className="mb-3 block">
            Type DELETE to confirm:
            <input className="field ml-2" value={wipeText} onChange={(e) => setWipeText(e.target.value)} data-testid="wipe-confirm-text" />
          </label>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setWipe(false)}>Cancel</button>
            <button
              className="btn-danger"
              disabled={wipeText.trim() !== 'DELETE'}
              data-testid="wipe-confirm"
              onClick={async () => {
                await disconnectFolder();
                await wipeEverything();
                window.location.hash = '/';
                window.location.reload();
              }}
            >
              Delete everything
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
