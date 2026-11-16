import { SNAPSHOT_KEEP, STORAGE_PREFIX } from '../config';
import { db, getMeta, setMeta, uid } from '../db';
import type { Attempt, Exam, PageText, ReviewRecord, Settings, Snapshot } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import type { Tombstone } from './merge';
import { forgetPdf } from './pdf';

/** Every write goes through here so the data folder (when one is connected) can mirror it. */
export type WriteEvent =
  | { kind: 'exam'; id: string }
  | { kind: 'pdf'; id: string }
  | { kind: 'pages'; id: string }
  | { kind: 'attempt'; id: string }
  | { kind: 'reviews'; id: string }
  | { kind: 'delete-exam'; id: string }
  | { kind: 'delete-attempt'; id: string }
  | { kind: 'snapshot'; id: string };

const hooks = new Set<(e: WriteEvent) => void>();
export function onWrite(fn: (e: WriteEvent) => void): () => void {
  hooks.add(fn);
  return () => hooks.delete(fn);
}
function emit(e: WriteEvent) {
  for (const h of hooks) {
    try {
      h(e);
    } catch {}
  }
}

/** When true (another tab took over), all writes are refused so two tabs never conflict. */
let readOnly = false;
export function setReadOnly(v: boolean): void {
  readOnly = v;
}
function guard() {
  if (readOnly) throw new Error('Block Sim is open in another tab; this tab is read-only.');
}

export async function saveExam(exam: Exam, touch = true): Promise<void> {
  guard();
  if (touch) exam.updatedAt = Date.now();
  await db.exams.put(exam);
  emit({ kind: 'exam', id: exam.id });
}

export async function savePdf(examId: string, data: ArrayBuffer): Promise<void> {
  guard();
  await db.blobs.put({ id: examId, data });
  forgetPdf(examId);
  emit({ kind: 'pdf', id: examId });
}

export async function savePageTexts(examId: string, pages: PageText[]): Promise<void> {
  guard();
  await db.pages.bulkPut(pages);
  emit({ kind: 'pages', id: examId });
}

export async function saveAttempt(a: Attempt): Promise<void> {
  guard();
  a.updatedAt = Date.now();
  await db.attempts.put(a);
  emit({ kind: 'attempt', id: a.id });
}

export async function getTombstones(): Promise<Tombstone[]> {
  return getMeta<Tombstone[]>('tombstones', []);
}
async function addTombstone(id: string): Promise<void> {
  const list = await getTombstones();
  list.push({ id, t: Date.now() });
  await setMeta('tombstones', list);
}

export async function deleteExam(id: string, withAttempts: boolean): Promise<void> {
  guard();
  await addTombstone(id);
  const attempts = withAttempts ? await db.attempts.where('examId').equals(id).toArray() : [];
  for (const a of attempts) await addTombstone(a.id);
  await db.transaction('rw', [db.exams, db.blobs, db.pages, db.attempts, db.reviews], async () => {
    await db.exams.delete(id);
    await db.blobs.delete(id);
    await db.pages.where('examId').equals(id).delete();
    if (withAttempts) {
      await db.attempts.where('examId').equals(id).delete();
      await db.reviews.where('examId').equals(id).delete();
    }
  });
  forgetPdf(id);
  emit({ kind: 'delete-exam', id });
  for (const a of attempts) emit({ kind: 'delete-attempt', id: a.id });
}

export async function deleteAttempt(id: string): Promise<void> {
  guard();
  await addTombstone(id);
  await db.attempts.delete(id);
  try {
    localStorage.removeItem(STORAGE_PREFIX + 'live:' + id);
  } catch {}
  emit({ kind: 'delete-attempt', id });
}

export async function getReview(qid: string, examId: string): Promise<ReviewRecord> {
  return (await db.reviews.get(qid)) ?? { qid, examId, updatedAt: 0, redos: [], reviewedAt: [] };
}

export async function addRedo(qid: string, examId: string, answer: string, correct: boolean, t = Date.now()): Promise<void> {
  guard();
  const r = await getReview(qid, examId);
  r.redos.push({ t, answer, correct });
  r.updatedAt = Date.now();
  await db.reviews.put(r);
  emit({ kind: 'reviews', id: examId });
}

export async function markReviewed(qid: string, examId: string, t = Date.now()): Promise<void> {
  if (readOnly) return;
  const r = await getReview(qid, examId);
  const last = r.reviewedAt[r.reviewedAt.length - 1] ?? 0;
  if (t - last < 60_000) return;
  r.reviewedAt.push(t);
  r.updatedAt = Date.now();
  await db.reviews.put(r);
  emit({ kind: 'reviews', id: examId });
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await getMeta<Partial<Settings>>('settings', {})) };
}
export async function patchSettings(p: Partial<Settings>): Promise<Settings> {
  const s = { ...(await getSettings()), ...p };
  if (!readOnly) await setMeta('settings', s);
  return s;
}

/** Automatic safety copy of all history (no PDFs). The last 5 are kept. */
export async function createSnapshot(reason: string): Promise<void> {
  if (readOnly) return;
  const [exams, attempts, reviews] = await Promise.all([db.exams.toArray(), db.attempts.toArray(), db.reviews.toArray()]);
  if (!attempts.length && !exams.length) return;
  const snap: Snapshot = { id: uid('s'), createdAt: Date.now(), reason, data: JSON.stringify({ exams, attempts, reviews }) };
  await db.snapshots.put(snap);
  const all = await db.snapshots.orderBy('createdAt').toArray();
  for (const old of all.slice(0, Math.max(0, all.length - SNAPSHOT_KEEP))) await db.snapshots.delete(old.id);
  emit({ kind: 'snapshot', id: snap.id });
}

export async function maybeDailySnapshot(): Promise<void> {
  const last = await db.snapshots.orderBy('createdAt').last();
  if (!last || Date.now() - last.createdAt > 86_400_000) await createSnapshot('daily');
}

export async function wipeEverything(): Promise<void> {
  guard();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k);
  } catch {}
  await Promise.all([db.exams.clear(), db.blobs.clear(), db.pages.clear(), db.attempts.clear(), db.reviews.clear(), db.snapshots.clear(), db.meta.clear()]);
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {}
  return false;
}
