import { useRef, useState } from 'react';
import { db } from '../db';
import { pairFiles, type FoundFile, type Pair } from '../lib/folderImport';
import { chooseFolder, DATA_DIR, folderSupported, pickDirectory } from '../lib/folder';
import { importExam } from '../lib/importRun';
import { go } from '../ui/hooks';

type RowState = 'waiting' | 'working' | 'done' | 'check' | 'skipped' | 'failed';
interface Row extends Pair {
  include: boolean;
  state: RowState;
  msg: string;
  examId?: string;
  already: boolean;
}

/** All PDFs below a picked folder (File System Access), skipping our own data folder. */
async function listDir(dir: FileSystemDirectoryHandle, prefix = ''): Promise<FoundFile[]> {
  const out: FoundFile[] = [];
  for await (const [name, h] of (dir as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (name.startsWith('.') || name.startsWith(DATA_DIR.split(' (')[0])) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (h.kind === 'directory') out.push(...(await listDir(h as FileSystemDirectoryHandle, path)));
    else if (/\.pdf$/i.test(name)) out.push({ path, name, folder: prefix, file: () => (h as FileSystemFileHandle).getFile() });
  }
  return out;
}

/** Import every exam in a folder of folders, pairing question PDFs with their answer PDFs. */
export function FolderImport() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [rootName, setRootName] = useState('');
  const [saveHere, setSaveHere] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const fallback = useRef<HTMLInputElement | null>(null);

  const load = async (files: FoundFile[], name: string) => {
    const existing = await db.exams.toArray();
    const seen = new Set(existing.map((e) => `${e.subject}|${e.sourceName ?? ''}`));
    const pairs = pairFiles(files);
    setRootName(name);
    setRows(pairs.map((p) => ({ ...p, include: !seen.has(`${p.category}|${p.question.name}`), state: 'waiting', msg: '', already: seen.has(`${p.category}|${p.question.name}`) })));
    if (!pairs.length) setMsg('No PDFs were found in that folder.');
  };

  const pick = async () => {
    setMsg('');
    if (folderSupported()) {
      const h = await pickDirectory();
      if (!h) return;
      setRoot(h);
      setMsg('Looking through the folder…');
      await load(await listDir(h), h.name);
      setMsg('');
    } else fallback.current?.click();
  };

  const update = (i: number, p: Partial<Row>) => setRows((rs) => rs && rs.map((r, k) => (k === i ? { ...r, ...p } : r)));

  const run = async () => {
    if (!rows) return;
    setRunning(true);
    // keep the data next to the PDFs: the app reads them from there instead of storing a second copy
    if (root && saveHere) await chooseFolder(root);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.include) {
        update(i, { state: 'skipped' });
        continue;
      }
      update(i, { state: 'working', msg: 'Starting…' });
      try {
        const q = await (await r.question.file()).arrayBuffer();
        const a = r.answer ? await (await r.answer.file()).arrayBuffer() : undefined;
        const res = await importExam(
          {
            question: q,
            name: r.name,
            category: r.category,
            layout: 'auto',
            keySource: a ? 'pdf' : 'none',
            keyPdf: a,
            sourcePath: root && saveHere ? r.question.path : undefined,
            sourceName: r.question.name,
            keySourceName: r.answer?.name,
            autoConfirm: true,
          },
          (m) => update(i, { msg: m }),
        );
        update(i, { state: res.exam.keyChecked ? 'done' : 'check', msg: res.exam.keyChecked ? `${res.exam.questions.length} questions, key complete` : `${res.exam.questions.length} questions: check the key`, examId: res.exam.id });
      } catch (e) {
        update(i, { state: 'failed', msg: String((e as Error)?.message ?? e) });
      }
    }
    setRunning(false);
    setMsg('Done. Exams that need a look at their answer key are marked “check the key”.');
  };

  const chosen = rows?.filter((r) => r.include).length ?? 0;
  return (
    <div data-testid="folder-import">
      <div className="mb-3 border border-gray-400 bg-white p-3 text-sm">
        <div className="mb-1 font-bold">How to organise your folder</div>
        <p>
          Make one folder (for example <b>Practice Exams</b>) with a subfolder per subject: <code>Surgery</code>, <code>OBGYN</code>, <code>Internal Medicine</code>… Put each exam’s question PDF and answer PDF in its subject folder, named so they match by number, for example <code>5 Q.pdf</code> and <code>5A.pdf</code> (also works: “Form 5.pdf” + “Form 5 answers.pdf”).
        </p>
        <p className="mt-1">
          {folderSupported() ? (
            <>
              Test Simulator will keep its own data (your attempts, highlights, notes) in a <b>{DATA_DIR}</b> subfolder of that same folder. Put the folder in iCloud Drive, OneDrive, Dropbox or Google Drive and everything follows you to another computer.
            </>
          ) : (
            'In this browser the PDFs are copied into the app. For saving data next to your PDFs, use Chrome or Edge on a computer.'
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={pick} disabled={running} data-testid="pick-folder">
          {rows ? 'Choose a different folder' : 'Choose your exams folder'}
        </button>
        <input
          ref={fallback}
          type="file"
          multiple
          className="hidden"
          data-testid="folder-input"
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(e) => {
            const list = [...(e.target.files ?? [])].map((f) => {
              const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
              const parts = rel.split('/');
              const top = parts.length > 1 ? parts[0] : '';
              // drop the picked folder's own name from the path
              const inner = parts.slice(top ? 1 : 0);
              return { path: inner.join('/'), name: f.name, folder: inner.slice(0, -1).join('/'), file: async () => f } as FoundFile;
            });
            const first = (e.target.files?.[0] as (File & { webkitRelativePath?: string }) | undefined)?.webkitRelativePath ?? '';
            void load(list, first.split('/')[0] || 'folder');
            e.target.value = '';
          }}
        />
        {msg && <span className="text-sm">{msg}</span>}
      </div>

      {rows && rows.length > 0 && (
        <>
          <div className="mt-4 text-sm">
            Found <b>{rows.length}</b> exam{rows.length === 1 ? '' : 's'} in <b>{rootName}</b>
            {rows.some((r) => r.already) && <> ({rows.filter((r) => r.already).length} already in your library, left unticked)</>}.
          </div>
          <table className="mt-2 w-full border-collapse border border-gray-400 text-sm" data-testid="folder-pairs">
            <thead>
              <tr>
                <th className="th w-8"></th>
                <th className="th">Folder</th>
                <th className="th">Exam</th>
                <th className="th">Question PDF</th>
                <th className="th">Answer PDF</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.question.path} data-testid="folder-row">
                  <td className="td">
                    <input type="checkbox" checked={r.include} disabled={running} onChange={(e) => update(i, { include: e.target.checked })} aria-label={`Import ${r.name}`} />
                  </td>
                  <td className="td">{r.category}</td>
                  <td className="td">
                    <input className="field w-40 py-0" value={r.name} disabled={running} onChange={(e) => update(i, { name: e.target.value })} />
                  </td>
                  <td className="td">{r.question.name}</td>
                  <td className="td">{r.answer?.name ?? <span className="text-red-700">none found</span>}</td>
                  <td className="td" data-testid="folder-state" data-state={r.state}>
                    {r.state === 'waiting' ? (r.include ? 'ready' : '—') : r.state === 'working' ? <span className="text-navy">{r.msg}</span> : r.state === 'done' ? <span className="text-green-800">✓ {r.msg}</span> : r.state === 'check' ? <a className="link text-amber-700" href={`#/exam/${r.examId}/key`}>{r.msg}</a> : r.state === 'skipped' ? 'skipped' : <span className="text-red-700">{r.msg}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {root && folderSupported() && (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={saveHere} onChange={(e) => setSaveHere(e.target.checked)} disabled={running} data-testid="save-here" />
              Keep my Test Simulator data in this folder too (recommended)
            </label>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button className="btn-primary px-5 py-2" disabled={running || !chosen} onClick={run} data-testid="folder-go">
              {running ? 'Importing…' : `Import ${chosen} exam${chosen === 1 ? '' : 's'}`}
            </button>
            {!running && rows.some((r) => r.state === 'done' || r.state === 'check') && (
              <button className="btn" onClick={() => go('/')}>Go to the Library</button>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-600">Scanned PDFs are read with text recognition once; large folders can take a while. You can keep using the app in another window meanwhile.</p>
        </>
      )}
    </div>
  );
}
