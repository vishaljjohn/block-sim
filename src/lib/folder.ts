/**
 * Data-folder storage (File System Access API, Chrome/Edge on desktop).
 *
 * The user picks a "Test Simulator" folder once. Every exam, PDF, OCR cache, attempt and review log is saved there
 * as its own versioned JSON file (never one big file). On launch the folder is read and merged into IndexedDB
 * by ID, so a cloud-synced folder edited on two computers never overwrites data. IndexedDB stays the working
 * copy and the full fallback everywhere else.
 */
import { db, getMeta, setMeta } from '../db';
import { mergeIntoDb, manifest, paths, type FileSet } from './backup';
import { mergeReviews, mergeTombstones, type Tombstone } from './merge';
import { getTombstones, onWrite, type WriteEvent } from './store';
import { logError } from './errorLog';
import { SNAPSHOT_KEEP } from '../config';

export interface FolderStatus {
  supported: boolean;
  connected: boolean;
  needsPermission: boolean;
  name: string | null;
  lastSyncAt: number | null;
  error: string | null;
  busy: boolean;
}

export const folderSupported = (): boolean => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

let status: FolderStatus = { supported: folderSupported(), connected: false, needsPermission: false, name: null, lastSyncAt: null, error: null, busy: false };
const subs = new Set<() => void>();
function setStatus(p: Partial<FolderStatus>) {
  status = { ...status, ...p };
  subs.forEach((f) => f());
}
/** Returns the same object until something changes (safe for useSyncExternalStore). */
export function folderStatus(): FolderStatus {
  return status;
}
export function onFolderStatus(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

let root: FileSystemDirectoryHandle | null = null;
/** the folder the user picked when the data lives in a subfolder next to their PDFs (exam PDFs are read from here) */
let base: FileSystemDirectoryHandle | null = null;
export const DATA_DIR = 'Test Simulator Data';

/** Read a file by its path inside the picked folder ("2 Surgery/5 Q.pdf"). */
export async function readFromBase(path: string): Promise<ArrayBuffer | null> {
  if (!base) return null;
  try {
    const parts = path.split('/');
    const name = parts.pop()!;
    let dir = base;
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    return await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer();
  } catch {
    return null;
  }
}
const pdfInPlace = async (examId: string) => !!base && !!(await db.exams.get(examId))?.sourcePath;

// ---------------------------------------------------------------- file helpers
async function dirFor(path: string, create: boolean): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
  const parts = path.split('/');
  const name = parts.pop()!;
  let dir = root!;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
  return { dir, name };
}

async function writeFile(path: string, data: Blob | string): Promise<void> {
  const { dir, name } = await dirFor(path, true);
  // write to a temporary file first, then swap it in, so a crash never leaves a half-written file
  const tmp = name + '.tmp';
  const fh = await dir.getFileHandle(tmp, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
  const handle = fh as FileSystemFileHandle & { move?: (name: string) => Promise<void> };
  if (handle.move) {
    try {
      await dir.removeEntry(name).catch(() => {});
      await handle.move(name);
      return;
    } catch {}
  }
  // no atomic rename available: write the real file and drop the temporary one
  const real = await dir.getFileHandle(name, { create: true });
  const w2 = await real.createWritable();
  await w2.write(data);
  await w2.close();
  await dir.removeEntry(tmp).catch(() => {});
}

async function removeFile(path: string): Promise<void> {
  try {
    const { dir, name } = await dirFor(path, false);
    await dir.removeEntry(name);
  } catch {}
}

async function readText(path: string): Promise<string | null> {
  try {
    const { dir, name } = await dirFor(path, false);
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch {
    return null;
  }
}

async function readBinary(path: string): Promise<ArrayBuffer | null> {
  try {
    const { dir, name } = await dirFor(path, false);
    return await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer();
  } catch {
    return null;
  }
}

async function listFiles(sub: string): Promise<{ name: string; file: () => Promise<File> }[]> {
  try {
    const dir = await root!.getDirectoryHandle(sub);
    const out: { name: string; file: () => Promise<File> }[] = [];
    for await (const [name, h] of (dir as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (h.kind === 'file' && !name.endsWith('.tmp')) out.push({ name, file: () => (h as FileSystemFileHandle).getFile() });
    }
    return out;
  } catch {
    return [];
  }
}

const json = (v: unknown) => JSON.stringify(v, null, 1);

// ---------------------------------------------------------------- permission
async function permission(h: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> {
  const hh = h as FileSystemDirectoryHandle & {
    queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
    requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
  };
  try {
    if ((await hh.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true;
    if (ask && (await hh.requestPermission?.({ mode: 'readwrite' })) === 'granted') return true;
  } catch {}
  return false;
}

// ---------------------------------------------------------------- full sync
/** Read the whole folder into IndexedDB (merge by ID), then write back anything the folder is missing or has older. */
export async function syncNow(): Promise<void> {
  if (!root) return;
  setStatus({ busy: true, error: null });
  try {
    // 1. folder → database
    const files: FileSet = { json: new Map(), bin: new Map() };
    const folderStamp = new Map<string, number>();
    for (const sub of ['exams', 'attempts', 'reviews']) {
      for (const f of await listFiles(sub)) {
        if (!f.name.endsWith('.json') || f.name.endsWith('.text.json')) continue;
        try {
          const v = JSON.parse(await (await f.file()).text());
          files.json.set(`${sub}/${f.name}`, v);
          if (v && typeof v.id === 'string' && typeof v.updatedAt === 'number') folderStamp.set(v.id, Math.max(folderStamp.get(v.id) ?? 0, v.updatedAt));
        } catch (e) {
          logError('folder:read ' + sub, e);
        }
      }
    }
    const del = await readText('deleted.json');
    if (del) {
      try {
        files.json.set('deleted.json', JSON.parse(del));
      } catch {}
    }
    await mergeIntoDb(files);

    // PDFs and text caches are large: only read the ones this device does not have yet
    for (const e of await db.exams.toArray()) {
      if (!(await db.blobs.get(e.id))) {
        const pdf = (e.sourcePath ? await readFromBase(e.sourcePath) : null) ?? (await readBinary(paths.pdf(e.id)));
        if (pdf) await db.blobs.put({ id: e.id, data: pdf });
      }
      if ((await db.pages.where('examId').equals(e.id).count()) === 0) {
        const t = await readText(paths.text(e.id));
        if (t) {
          try {
            await db.pages.bulkPut(JSON.parse(t));
          } catch {}
        }
      }
    }

    // 2. database → folder (only what is missing or newer)
    await writeFile('manifest.json', json(manifest()));
    const tombs = await getTombstones();
    await writeFile('deleted.json', json(tombs));
    const dead = new Set(tombs.map((t) => t.id));
    for (const e of await db.exams.toArray()) {
      if ((folderStamp.get(e.id) ?? -1) < e.updatedAt) await writeFile(paths.exam(e.id), json(e));
      if (!(e.sourcePath && base) && !(await readBinary(paths.pdf(e.id)).then((b) => !!b))) {
        const b = await db.blobs.get(e.id);
        if (b) await writeFile(paths.pdf(e.id), new Blob([b.data], { type: 'application/pdf' }));
      }
      await writeTextCache(e.id, false);
    }
    for (const a of await db.attempts.toArray()) {
      if ((folderStamp.get(a.id) ?? -1) < a.updatedAt) await writeFile(paths.attempt(a.id), json(a));
    }
    await writeAllReviews();
    // files for documents deleted on any computer
    for (const sub of ['exams', 'attempts']) {
      for (const f of await listFiles(sub)) {
        const id = f.name.replace(/\.(text\.json|json|pdf)$/, '');
        if (dead.has(id) && !(await db.exams.get(id)) && !(await db.attempts.get(id))) await removeFile(`${sub}/${f.name}`);
      }
    }
    setStatus({ busy: false, lastSyncAt: Date.now(), error: null });
  } catch (e) {
    logError('folder:sync', e);
    setStatus({ busy: false, error: friendly(e) });
    if (!(await permission(root, false))) setStatus({ connected: false, needsPermission: true });
  }
}

async function writeTextCache(examId: string, force: boolean) {
  const pages = await db.pages.where('examId').equals(examId).toArray();
  if (!pages.length) return;
  if (!force) {
    const existing = await readText(paths.text(examId));
    if (existing) {
      try {
        if ((JSON.parse(existing) as unknown[]).length >= pages.length) return;
      } catch {}
    }
  }
  await writeFile(paths.text(examId), JSON.stringify(pages));
}

async function writeAllReviews() {
  const all = await db.reviews.toArray();
  const byExam = new Map<string, typeof all>();
  for (const r of all) (byExam.get(r.examId) ?? byExam.set(r.examId, []).get(r.examId)!).push(r);
  for (const [examId] of byExam) await writeReviews(examId);
}

/** Review logs are merged with the file before writing, so another computer's redos are never dropped. */
async function writeReviews(examId: string) {
  const mine = await db.reviews.where('examId').equals(examId).toArray();
  const existing = await readText(paths.reviews(examId));
  if (existing) {
    try {
      const merged = mergeReviews(mine, JSON.parse(existing));
      await db.reviews.bulkPut(merged);
      await writeFile(paths.reviews(examId), json(merged));
      return;
    } catch {}
  }
  await writeFile(paths.reviews(examId), json(mine));
}

function friendly(e: unknown): string {
  const n = (e as Error)?.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'permission to the folder was withdrawn. Click Reconnect.';
  if (n === 'NotFoundError') return 'the folder was moved or deleted. Choose it again in Settings.';
  if (n === 'QuotaExceededError') return 'the disk is full.';
  return String((e as Error)?.message ?? e);
}

// ---------------------------------------------------------------- incremental writes
const pending = new Map<string, WriteEvent>();
let timer: number | null = null;
let flushing: Promise<void> = Promise.resolve();

function queue(e: WriteEvent) {
  if (!root || !status.connected) return;
  pending.set(`${e.kind}:${e.id}`, e);
  if (timer != null) window.clearTimeout(timer);
  timer = window.setTimeout(() => void flush(), 700);
}

export function flush(): Promise<void> {
  if (timer != null) window.clearTimeout(timer);
  timer = null;
  const batch = [...pending.values()];
  pending.clear();
  if (!batch.length || !root) return flushing;
  flushing = flushing.then(async () => {
    try {
      let tombsChanged = false;
      for (const e of batch) {
        switch (e.kind) {
          case 'exam': {
            const ex = await db.exams.get(e.id);
            if (ex) await writeFile(paths.exam(ex.id), json(ex));
            break;
          }
          case 'pdf': {
            // a PDF imported from the picked folder stays where it is: no second copy
            if (await pdfInPlace(e.id)) break;
            const b = await db.blobs.get(e.id);
            if (b) await writeFile(paths.pdf(e.id), new Blob([b.data], { type: 'application/pdf' }));
            break;
          }
          case 'pages':
            await writeTextCache(e.id, true);
            break;
          case 'attempt': {
            const a = await db.attempts.get(e.id);
            if (a) await writeFile(paths.attempt(a.id), json(a));
            break;
          }
          case 'reviews':
            await writeReviews(e.id);
            break;
          case 'delete-exam':
            await removeFile(paths.exam(e.id));
            await removeFile(paths.pdf(e.id));
            await removeFile(paths.text(e.id));
            tombsChanged = true;
            break;
          case 'delete-attempt':
            await removeFile(paths.attempt(e.id));
            tombsChanged = true;
            break;
          case 'snapshot':
            await writeSnapshots();
            break;
        }
      }
      if (tombsChanged) {
        const fromFile = await readText('deleted.json');
        let other: Tombstone[] = [];
        try {
          other = fromFile ? JSON.parse(fromFile) : [];
        } catch {}
        const merged = mergeTombstones(await getTombstones(), other);
        await setMeta('tombstones', merged);
        await writeFile('deleted.json', json(merged));
      }
      setStatus({ lastSyncAt: Date.now(), error: null });
    } catch (err) {
      logError('folder:write', err);
      // keep the events so nothing is lost; they are written after reconnecting
      for (const e of batch) pending.set(`${e.kind}:${e.id}`, e);
      const ok = root ? await permission(root, false) : false;
      setStatus({ error: friendly(err), ...(ok ? {} : { connected: false, needsPermission: true }) });
    }
  });
  return flushing;
}

async function writeSnapshots() {
  const snaps = await db.snapshots.orderBy('createdAt').toArray();
  const keep = new Set(snaps.slice(-SNAPSHOT_KEEP).map((s) => `${s.id}.json`));
  for (const s of snaps.slice(-SNAPSHOT_KEEP)) {
    if (!(await readText(`snapshots/${s.id}.json`))) await writeFile(`snapshots/${s.id}.json`, s.data);
  }
  for (const f of await listFiles('snapshots')) if (!keep.has(f.name)) await removeFile(`snapshots/${f.name}`);
}

// ---------------------------------------------------------------- lifecycle
let unhook: (() => void) | null = null;

async function connect(h: FileSystemDirectoryHandle, b: FileSystemDirectoryHandle | null = null): Promise<void> {
  root = h;
  base = b;
  setStatus({ connected: true, needsPermission: false, name: b ? `${b.name}/${h.name}` : h.name, error: null });
  unhook?.();
  unhook = onWrite(queue);
  await syncNow();
}

/** Called on launch: reconnects silently when the browser still has permission, otherwise shows a one-click button. */
export async function initFolderSync(): Promise<void> {
  if (!folderSupported()) return;
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flush();
  });
  const h = await getMeta<FileSystemDirectoryHandle | null>('folderHandle', null);
  const b = await getMeta<FileSystemDirectoryHandle | null>('folderBase', null);
  if (!h) return;
  setStatus({ name: b ? `${b.name}/${h.name}` : h.name });
  if (await permission(b ?? h, false)) {
    // never block the app on a slow (cloud) folder
    void connect(h, b);
  } else {
    root = h;
    base = b;
    setStatus({ needsPermission: true, connected: false });
    unhook?.();
    unhook = onWrite(queue); // collect writes; they go out after reconnecting
  }
}

/** One click: re-grant permission after a browser restart. */
export async function reconnectFolder(): Promise<boolean> {
  const h = await getMeta<FileSystemDirectoryHandle | null>('folderHandle', null);
  const b = await getMeta<FileSystemDirectoryHandle | null>('folderBase', null);
  if (!h) return false;
  if (!(await permission(b ?? h, true))) {
    setStatus({ error: 'Permission was not granted.' });
    return false;
  }
  await connect(h, b);
  await flush();
  return true;
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ id: 'test-simulator-folder', mode: 'readwrite', startIn: 'documents' });
  } catch {
    return null; // cancelled
  }
}

/**
 * Pick (or change) the data folder. The app keeps its data in a "Test Simulator Data" subfolder of the folder you
 * pick (ideally the same folder as your exam PDFs). Picking an existing data folder directly also works.
 * Existing data on both sides is merged.
 */
export async function chooseFolder(picked?: FileSystemDirectoryHandle): Promise<boolean> {
  if (!folderSupported()) return false;
  const h = picked ?? (await pickDirectory());
  if (!h) return false;
  if (!(await permission(h, true))) {
    setStatus({ error: 'Test Simulator needs permission to save in that folder.' });
    return false;
  }
  // the picked folder is itself a data folder (older setups): use it as is
  let isData = h.name === DATA_DIR;
  try {
    await h.getFileHandle('manifest.json');
    isData = true;
  } catch {}
  const data = isData ? h : await h.getDirectoryHandle(DATA_DIR, { create: true });
  const b = isData ? null : h;
  await flush();
  await setMeta('folderHandle', data);
  await setMeta('folderBase', b);
  await connect(data, b);
  return true;
}

export async function disconnectFolder(): Promise<void> {
  await flush().catch(() => {});
  unhook?.();
  unhook = null;
  root = null;
  base = null;
  pending.clear();
  await setMeta('folderHandle', null);
  await setMeta('folderBase', null);
  setStatus({ connected: false, needsPermission: false, name: null, lastSyncAt: null, error: null });
}
