import Dexie, { type Table } from 'dexie';
import { DB_NAME, SCHEMA_VERSION } from './config';
import type { Attempt, Exam, PageText, ReviewRecord, Snapshot } from './types';

export interface BlobRow {
  id: string; // examId
  data: ArrayBuffer;
}
export interface MetaRow {
  key: string;
  value: any;
}

/** v1 stored questions as { pages:number[] }. v2 uses segments. Kept as a pure function so it can be tested. */
export function migrateExam(raw: any): Exam {
  const e = { ...raw };
  e.questions = (e.questions ?? []).map((q: any) => {
    const out = { ...q };
    if (!out.segments) {
      const pages: number[] = Array.isArray(out.pages) ? out.pages : [];
      out.segments = out.region ? [{ page: out.region.page, rect: { x: out.region.x, y: out.region.y, w: out.region.w, h: out.region.h } }] : pages.map((page) => ({ page }));
      delete out.pages;
      delete out.region;
    }
    out.tags = out.tags ?? [];
    out.explanation = out.explanation ?? '';
    out.answer = out.answer ?? '';
    out.choiceCount = out.choiceCount ?? 5;
    return out;
  });
  e.crop = e.crop ?? null;
  e.autoCrop = e.autoCrop ?? true;
  e.keyChecked = e.keyChecked ?? false;
  e.textStatus = e.textStatus ?? 'none';
  e.subject = e.subject ?? '';
  e.schema = SCHEMA_VERSION;
  return e as Exam;
}

export function migrateAttempt(raw: any): Attempt {
  const a = { ...raw };
  a.items = (a.items ?? []).map((it: any) => ({
    changes: [],
    timeMs: 0,
    marked: false,
    confidence: null,
    strikes: [],
    note: '',
    locked: false,
    key: null,
    tags: [],
    reviewNote: '',
    missReason: null,
    ...it,
    // v1 highlights had no "kind"
    ...{ highlights: (it.highlights ?? []).map((h: any) => (h.kind ? h : { kind: 'box', ...h })) },
  }));
  a.paused = a.paused ?? false;
  a.phase = a.phase ?? (a.status === 'completed' ? 'done' : 'block');
  a.breakStartedAt = a.breakStartedAt ?? null;
  a.completedAt = a.completedAt ?? null;
  a.currentBlock = a.currentBlock ?? 0;
  a.blocks = (a.blocks ?? []).map((b: any) => ({ warned5: false, ended: false, ...b }));
  a.schema = SCHEMA_VERSION;
  return a as Attempt;
}

export class BlockSimDB extends Dexie {
  exams!: Table<Exam, string>;
  blobs!: Table<BlobRow, string>;
  pages!: Table<PageText, string>;
  attempts!: Table<Attempt, string>;
  reviews!: Table<ReviewRecord, string>;
  snapshots!: Table<Snapshot, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      exams: 'id, updatedAt',
      blobs: 'id',
      pages: 'id, examId',
      attempts: 'id, examId, status, updatedAt',
      reviews: 'qid, examId',
      snapshots: 'id, createdAt',
      meta: 'key',
    });
    this.version(2)
      .stores({
        exams: 'id, updatedAt',
        blobs: 'id',
        pages: 'id, examId',
        attempts: 'id, examId, status, updatedAt',
        reviews: 'qid, examId',
        snapshots: 'id, createdAt',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('exams')
          .toCollection()
          .modify((e: any) => Object.assign(e, migrateExam(e)));
        await tx
          .table('attempts')
          .toCollection()
          .modify((a: any) => Object.assign(a, migrateAttempt(a)));
      });
  }
}

export const db = new BlockSimDB();

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

export function uid(prefix = ''): string {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return prefix + Date.now().toString(36) + Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}
