import { strFromU8, strToU8, unzip, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { APP_VERSION, SCHEMA_VERSION } from '../config';
import { getMeta, db, migrateAttempt, migrateExam, setMeta } from '../db';
import type { Attempt, Exam, PageText, ReviewRecord } from '../types';
import { applyTombstones, betterAttempt, mergeById, mergeReviews, mergeTombstones, type Tombstone } from './merge';
import { getTombstones } from './store';
import { forgetPdf } from './pdf';

/**
 * One file layout is used for both backups (zipped) and the data folder (plain files):
 *   manifest.json, deleted.json
 *   exams/<id>.json   exams/<id>.pdf   exams/<id>.text.json
 *   attempts/<id>.json
 *   reviews/<examId>.json
 */
export interface FileSet {
  json: Map<string, unknown>;
  bin: Map<string, ArrayBuffer>;
}

export const paths = {
  exam: (id: string) => `exams/${id}.json`,
  pdf: (id: string) => `exams/${id}.pdf`,
  text: (id: string) => `exams/${id}.text.json`,
  attempt: (id: string) => `attempts/${id}.json`,
  reviews: (examId: string) => `reviews/${examId}.json`,
};

export function manifest() {
  return { app: 'block-sim', schema: SCHEMA_VERSION, version: APP_VERSION, exportedAt: Date.now() };
}

export async function collectFiles(opts: { examId?: string; withPdfs?: boolean } = {}): Promise<FileSet> {
  const json = new Map<string, unknown>();
  const bin = new Map<string, ArrayBuffer>();
  const exams = opts.examId ? (await db.exams.where('id').equals(opts.examId).toArray()) : await db.exams.toArray();
  json.set('manifest.json', manifest());
  if (!opts.examId) json.set('deleted.json', await getTombstones());
  if (!opts.examId) {
    const colls = await getMeta<unknown[]>('noteCollections', []);
    if (colls.length) json.set('collections.json', colls);
  }
  for (const e of exams) {
    json.set(paths.exam(e.id), e);
    const pages = await db.pages.where('examId').equals(e.id).toArray();
    if (pages.length) json.set(paths.text(e.id), pages);
    if (opts.withPdfs !== false) {
      const b = await db.blobs.get(e.id);
      if (b) bin.set(paths.pdf(e.id), b.data);
    }
  }
  const attempts = opts.examId ? await db.attempts.where('examId').equals(opts.examId).toArray() : await db.attempts.toArray();
  for (const a of attempts) json.set(paths.attempt(a.id), a);
  const reviews = opts.examId ? await db.reviews.where('examId').equals(opts.examId).toArray() : await db.reviews.toArray();
  const byExam = new Map<string, ReviewRecord[]>();
  for (const r of reviews) (byExam.get(r.examId) ?? byExam.set(r.examId, []).get(r.examId)!).push(r);
  for (const [examId, list] of byExam) json.set(paths.reviews(examId), list);
  return { json, bin };
}

export async function zipFiles(files: FileSet): Promise<Blob> {
  const chunks: BlobPart[] = [];
  await new Promise<void>((resolve, reject) => {
    const zip = new Zip((err, data, final) => {
      if (err) return reject(err);
      chunks.push(data as unknown as BlobPart);
      if (final) resolve();
    });
    for (const [name, value] of files.json) {
      const f = new ZipDeflate(name, { level: 6 });
      zip.add(f);
      f.push(strToU8(JSON.stringify(value)), true);
    }
    for (const [name, buf] of files.bin) {
      const f = new ZipPassThrough(name); // PDFs are already compressed
      zip.add(f);
      f.push(new Uint8Array(buf), true);
    }
    zip.end();
  });
  return new Blob(chunks, { type: 'application/zip' });
}

export async function exportBackup(opts: { examId?: string } = {}): Promise<Blob> {
  const blob = await zipFiles(await collectFiles(opts));
  if (!opts.examId) await setMeta('settings', { ...((await db.meta.get('settings'))?.value ?? {}), lastBackupAt: Date.now() });
  return blob;
}

export async function readZip(file: Blob): Promise<FileSet> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(buf, (err, data) => (err ? reject(err) : resolve(data))));
  const json = new Map<string, unknown>();
  const bin = new Map<string, ArrayBuffer>();
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('.json')) {
      try {
        json.set(name, JSON.parse(strFromU8(data)));
      } catch {}
    } else if (name.endsWith('.pdf')) bin.set(name, data.slice().buffer as ArrayBuffer);
  }
  return { json, bin };
}

export interface MergeResult {
  exams: number;
  attempts: number;
  reviews: number;
  /** PDFs added to this device (PDFs already here are not copied again) */
  pdfs: number;
}

/**
 * Merge a set of files (a backup or the data folder) into this device's storage, by ID.
 * Existing data is never replaced by an older copy and nothing local is removed
 * (except documents explicitly deleted, on any computer, after their last change).
 */
export async function mergeIntoDb(files: FileSet, opts: { resurrect?: boolean } = {}): Promise<MergeResult> {
  const man = files.json.get('manifest.json') as { app?: string } | undefined;
  if (man && man.app && man.app !== 'block-sim') throw new Error('This file is not a Test Simulator backup.');
  const inExams: Exam[] = [];
  const inAttempts: Attempt[] = [];
  let inReviews: ReviewRecord[] = [];
  const inPages: PageText[] = [];
  for (const [name, value] of files.json) {
    // match on content, not file name, so cloud "conflicted copy" files still merge correctly
    if (name.startsWith('exams/') && name.endsWith('.text.json') && Array.isArray(value)) inPages.push(...(value as PageText[]));
    else if (name.startsWith('exams/') && (value as Exam)?.questions) inExams.push(migrateExam(value));
    else if (name.startsWith('attempts/') && (value as Attempt)?.items) inAttempts.push(migrateAttempt(value));
    else if (name.startsWith('reviews/') && Array.isArray(value)) inReviews = mergeReviews(inReviews, value as ReviewRecord[]);
  }
  let tombs = mergeTombstones(await getTombstones(), (files.json.get('deleted.json') as Tombstone[] | undefined) ?? []);
  if (opts.resurrect) {
    // the user chose to restore this backup: whatever it contains comes back, even if it was deleted here since
    const back = new Set([...inExams.map((e) => e.id), ...inAttempts.map((a) => a.id)]);
    tombs = tombs.filter((t) => !back.has(t.id));
  }
  await setMeta('tombstones', tombs);

  const localExams = await db.exams.toArray();
  const localAttempts = await db.attempts.toArray();
  const exams = applyTombstones(mergeById(localExams, inExams), tombs);
  const attempts = applyTombstones(mergeById(localAttempts, inAttempts, betterAttempt), tombs);
  const reviews = mergeReviews(await db.reviews.toArray(), inReviews);
  const keepExam = new Set(exams.map((e) => e.id));

  await db.transaction('rw', [db.exams, db.attempts, db.reviews], async () => {
    await db.exams.bulkPut(exams);
    for (const e of localExams) if (!keepExam.has(e.id)) await db.exams.delete(e.id);
    await db.attempts.bulkPut(attempts);
    const keepA = new Set(attempts.map((a) => a.id));
    for (const a of localAttempts) if (!keepA.has(a.id)) await db.attempts.delete(a.id);
    await db.reviews.bulkPut(reviews);
  });

  let pdfs = 0;
  for (const [name, buf] of files.bin) {
    const id = name.replace(/^exams\//, '').replace(/\.pdf$/, '');
    if (!keepExam.has(id)) continue;
    if (!(await db.blobs.get(id))) {
      await db.blobs.put({ id, data: buf });
      forgetPdf(id);
      pdfs++;
    }
  }
  // note collections: union by id, keeping every note in either copy
  const inColls = files.json.get('collections.json') as { id: string; name: string; keys: string[] }[] | undefined;
  if (Array.isArray(inColls) && inColls.length) {
    const mine = await getMeta<{ id: string; name: string; keys: string[] }[]>('noteCollections', []);
    const byId = new Map(mine.map((c) => [c.id, c]));
    for (const c of inColls) {
      const m = byId.get(c.id);
      byId.set(c.id, m ? { ...m, keys: [...new Set([...m.keys, ...(c.keys ?? [])])] } : c);
    }
    await setMeta('noteCollections', [...byId.values()]);
  }
  const havePages = new Set((await db.pages.toCollection().primaryKeys()) as string[]);
  const newPages = inPages.filter((p) => keepExam.has(p.examId) && !havePages.has(p.id));
  if (newPages.length) await db.pages.bulkPut(newPages);
  return { exams: inExams.length, attempts: inAttempts.length, reviews: inReviews.length, pdfs };
}

export async function restoreBackup(file: Blob): Promise<MergeResult> {
  return mergeIntoDb(await readZip(file), { resurrect: true });
}
