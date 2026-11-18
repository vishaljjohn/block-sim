/**
 * Library and Video Library: a folder on the person's own computer, read in place (nothing is copied or uploaded).
 * Chrome/Edge remember the folder (its handle is kept in this device's storage); other browsers pick the folder
 * again each visit. Reading progress, bookmarks and video positions are kept in the app's own storage.
 */
import { useEffect, useState } from 'react';
import { getMeta, setMeta } from '../db';
import { useLive } from '../ui/hooks';

export type Kind = 'library' | 'videos';
export const DOC_EXT = /\.(pdf|html?|txt|md|png|jpe?g|gif|webp|svg)$/i;
export const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv|mkv)$/i;

export interface LFile {
  name: string;
  /** path inside the chosen folder, "/"-separated */
  path: string;
  size: number;
}
export interface LDir {
  name: string;
  path: string;
  dirs: LDir[];
  files: LFile[];
}

type Perm = FileSystemDirectoryHandle & {
  queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
};
export const pickerSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// in-memory state per kind (handles from the picker, or File objects from the fallback <input webkitdirectory>)
const mem: Record<Kind, { handle: FileSystemDirectoryHandle | null; files: Map<string, File> | null; tree: LDir | null; name: string | null }> = {
  library: { handle: null, files: null, tree: null, name: null },
  videos: { handle: null, files: null, tree: null, name: null },
};
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const tidy = (n: string) => n.replace(/\.[a-z0-9]+$/i, '').replace(/^\d+[\s._-]+(?=\D)/, '');
/** "03 - Cardiology.mp4" → "Cardiology" */
export const displayName = (n: string) => tidy(n) || n;

async function walk(dir: FileSystemDirectoryHandle, path: string, ext: RegExp, depth = 0): Promise<LDir> {
  const out: LDir = { name: dir.name, path, dirs: [], files: [] };
  if (depth > 8) return out;
  for await (const [name, h] of (dir as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (name.startsWith('.')) continue;
    const p = path ? `${path}/${name}` : name;
    if (h.kind === 'directory') {
      const d = await walk(h as FileSystemDirectoryHandle, p, ext, depth + 1);
      if (d.files.length || d.dirs.length) out.dirs.push(d);
    } else if (ext.test(name)) {
      const f = await (h as FileSystemFileHandle).getFile();
      out.files.push({ name, path: p, size: f.size });
    }
  }
  out.dirs.sort((a, b) => natural(a.name, b.name));
  out.files.sort((a, b) => natural(a.name, b.name));
  return out;
}

function treeFromFiles(list: File[], ext: RegExp): { tree: LDir; files: Map<string, File> } {
  const files = new Map<string, File>();
  const rootName = (list[0] as File & { webkitRelativePath?: string })?.webkitRelativePath?.split('/')[0] ?? 'Folder';
  const tree: LDir = { name: rootName, path: '', dirs: [], files: [] };
  for (const f of list) {
    const rel = ((f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name).split('/').slice(1);
    if (!rel.length || !ext.test(f.name) || rel.some((x) => x.startsWith('.'))) continue;
    let d = tree;
    for (let i = 0; i < rel.length - 1; i++) {
      const p = rel.slice(0, i + 1).join('/');
      let nd = d.dirs.find((x) => x.path === p);
      if (!nd) d.dirs.push((nd = { name: rel[i], path: p, dirs: [], files: [] }));
      d = nd;
    }
    const path = rel.join('/');
    d.files.push({ name: f.name, path, size: f.size });
    files.set(path, f);
  }
  const sort = (d: LDir) => {
    d.dirs.sort((a, b) => natural(a.name, b.name));
    d.files.sort((a, b) => natural(a.name, b.name));
    d.dirs.forEach(sort);
  };
  sort(tree);
  return { tree, files };
}

const extOf = (k: Kind) => (k === 'videos' ? VIDEO_EXT : DOC_EXT);

/** Ask for a folder (Chrome/Edge): remembered for next time. */
export async function chooseFolder(kind: Kind): Promise<void> {
  const h = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ id: `ts-${kind}`, mode: 'read' });
  await setMeta(`${kind}Folder`, h);
  mem[kind] = { handle: h, files: null, tree: await walk(h, '', extOf(kind)), name: h.name };
  changed();
}
/** Other browsers: the files picked with <input webkitdirectory> (for this visit only). */
export function loadPickedFiles(kind: Kind, list: FileList | null): void {
  if (!list || !list.length) return;
  const { tree, files } = treeFromFiles([...list], extOf(kind));
  mem[kind] = { handle: null, files, tree, name: tree.name };
  changed();
}
export async function forgetFolder(kind: Kind): Promise<void> {
  await setMeta(`${kind}Folder`, null);
  mem[kind] = { handle: null, files: null, tree: null, name: null };
  changed();
}
/** Re-open the remembered folder; `ask` (inside a click) asks the browser for permission again after a restart. */
export async function reconnect(kind: Kind, ask: boolean): Promise<'ok' | 'permission' | 'none'> {
  if (mem[kind].tree) return 'ok';
  const h = (await getMeta<FileSystemDirectoryHandle | null>(`${kind}Folder`, null)) as Perm | null;
  if (!h) return 'none';
  let ok = (await h.queryPermission?.({ mode: 'read' })) === 'granted';
  if (!ok && ask) ok = (await h.requestPermission?.({ mode: 'read' })) === 'granted';
  if (!ok) {
    mem[kind].name = h.name;
    changed();
    return 'permission';
  }
  mem[kind] = { handle: h, files: null, tree: await walk(h, '', extOf(kind)), name: h.name };
  changed();
  return 'ok';
}
export async function rescan(kind: Kind): Promise<void> {
  const h = mem[kind].handle;
  if (h) {
    mem[kind].tree = await walk(h, '', extOf(kind));
    changed();
  }
}

/** The folder tree (null until a folder is connected), its name, and whether permission must be asked again. */
export function useFolder(kind: Kind): { tree: LDir | null; name: string | null; needsPermission: boolean; loading: boolean } {
  const [, tick] = useState(0);
  const [state, setState] = useState<'loading' | 'ok' | 'permission' | 'none'>(mem[kind].tree ? 'ok' : 'loading');
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    if (!mem[kind].tree) void reconnect(kind, false).then(setState, () => setState('none'));
    return () => void listeners.delete(f);
  }, [kind]);
  return { tree: mem[kind].tree, name: mem[kind].name, needsPermission: state === 'permission' && !mem[kind].tree, loading: state === 'loading' && !mem[kind].tree };
}

/** A blob: URL for a file in the folder (revoke when done). */
export async function fileUrl(kind: Kind, path: string): Promise<{ url: string; file: File }> {
  let file = mem[kind].files?.get(path);
  if (!file) {
    let d = mem[kind].handle;
    if (!d) throw new Error('The folder is not connected.');
    const parts = path.split('/');
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
    file = await (await d.getFileHandle(parts[parts.length - 1])).getFile();
  }
  return { url: URL.createObjectURL(file), file };
}

export function allFiles(d: LDir): LFile[] {
  return [...d.files, ...d.dirs.flatMap(allFiles)];
}
export function findDir(d: LDir, path: string): LDir | null {
  if (d.path === path) return d;
  for (const c of d.dirs) {
    const r = path === c.path || path.startsWith(c.path + '/') ? findDir(c, path) : null;
    if (r) return r;
  }
  return null;
}

// ---------------------------------------------------------------- progress
export interface LibState {
  done: string[];
  bookmarks: string[];
  opened: { path: string; t: number }[];
}
export interface VideoState {
  /** seconds watched / length, per path */
  pos: Record<string, { at: number; dur: number; t: number }>;
  watched: string[];
}
export const useLibState = () => useLive(() => getMeta<LibState>('libraryState', { done: [], bookmarks: [], opened: [] }), []);
export const useVideoState = () => useLive(() => getMeta<VideoState>('videoState', { pos: {}, watched: [] }), []);
export async function patchLib(f: (s: LibState) => LibState): Promise<void> {
  await setMeta('libraryState', f(await getMeta<LibState>('libraryState', { done: [], bookmarks: [], opened: [] })));
}
export async function patchVideo(f: (s: VideoState) => VideoState): Promise<void> {
  await setMeta('videoState', f(await getMeta<VideoState>('videoState', { pos: {}, watched: [] })));
}
export const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
