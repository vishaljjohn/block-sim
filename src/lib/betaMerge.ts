import Dexie from 'dexie';
import { BlockSimDB, getMeta, setMeta } from '../db';
import type { PageText, ReviewRecord } from '../types';
import { mergeIntoDb, paths, type FileSet } from './backup';
import { logError } from './errorLog';

/** The browser storage the retired beta version used (same site, separate database). */
export const OLD_BETA_DB = 'blocksim-beta';

/**
 * The beta version is retired. Anything made there (exams, PDFs, attempts, highlights, notes) is merged into this
 * app's storage once, by ID, the same way a backup is restored: nothing here is replaced by an older copy and the
 * old beta storage is left untouched.
 */
export async function bringInBetaHistory(): Promise<number> {
  try {
    if (await getMeta('betaMerged', false)) return 0;
    if (!(await Dexie.exists(OLD_BETA_DB))) {
      await setMeta('betaMerged', true);
      return 0;
    }
    const old = new BlockSimDB(OLD_BETA_DB);
    await old.open();
    try {
      const files: FileSet = { json: new Map(), bin: new Map() };
      files.json.set('manifest.json', { app: 'block-sim' });
      const tombs = (await old.meta.get('tombstones'))?.value;
      if (Array.isArray(tombs)) files.json.set('deleted.json', tombs);
      const exams = (await old.exams.toArray()).filter((e) => !e.isDemo);
      for (const e of exams) {
        files.json.set(paths.exam(e.id), e);
        const pages: PageText[] = await old.pages.where('examId').equals(e.id).toArray();
        if (pages.length) files.json.set(paths.text(e.id), pages);
        const b = await old.blobs.get(e.id);
        if (b) files.bin.set(paths.pdf(e.id), b.data);
      }
      for (const a of await old.attempts.toArray()) files.json.set(paths.attempt(a.id), a);
      const byExam = new Map<string, ReviewRecord[]>();
      for (const r of await old.reviews.toArray()) (byExam.get(r.examId) ?? byExam.set(r.examId, []).get(r.examId)!).push(r);
      for (const [id, list] of byExam) files.json.set(paths.reviews(id), list);
      const res = await mergeIntoDb(files);
      await setMeta('betaMerged', true);
      return res.exams + res.attempts;
    } finally {
      old.close();
    }
  } catch (e) {
    // never block the app; it is tried again next time
    logError('bring in beta history', e);
    return 0;
  }
}
