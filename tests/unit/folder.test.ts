import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Minimal in-memory File System Access directory. */
class FakeFile {
  constructor(public data: Blob) {}
}
class FakeDir {
  kind = 'directory' as const;
  files = new Map<string, FakeFile>();
  dirs = new Map<string, FakeDir>();
  constructor(public name: string) {}
  async getDirectoryHandle(n: string, o?: { create?: boolean }) {
    if (!this.dirs.has(n)) {
      if (!o?.create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
      this.dirs.set(n, new FakeDir(n));
    }
    return this.dirs.get(n)!;
  }
  async getFileHandle(n: string, o?: { create?: boolean }) {
    if (!this.files.has(n)) {
      if (!o?.create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
      this.files.set(n, new FakeFile(new Blob([])));
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      kind: 'file' as const,
      name: n,
      async getFile() {
        return self.files.get(n)!.data as File;
      },
      async createWritable() {
        const parts: BlobPart[] = [];
        return {
          async write(d: BlobPart) {
            parts.push(d);
          },
          async close() {
            self.files.set(n, new FakeFile(new Blob(parts)));
          },
        };
      },
    };
  }
  async removeEntry(n: string) {
    if (!this.files.delete(n) && !this.dirs.delete(n)) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
  }
  async *entries(): AsyncIterable<[string, unknown]> {
    for (const n of this.files.keys()) yield [n, await this.getFileHandle(n)];
    for (const [n, d] of this.dirs) yield [n, d];
  }
  async queryPermission() {
    return 'granted';
  }
  async requestPermission() {
    return 'granted';
  }
}

const shared = new FakeDir('Test Simulator');

beforeEach(() => {
  vi.resetModules();
  (globalThis as any).window = Object.assign(globalThis.window ?? {}, {
    showDirectoryPicker: async () => shared,
    addEventListener() {},
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
  (globalThis as any).document = { addEventListener() {}, hidden: false };
});

async function computer(dbName: string) {
  vi.resetModules();
  vi.doMock('../../src/config', async (orig) => ({ ...(await orig<object>()), DB_NAME: dbName }));
  const dbm = await import('../../src/db');
  const store = await import('../../src/lib/store');
  const folder = await import('../../src/lib/folder');
  return { ...dbm, ...store, ...folder };
}

const exam = (id: string, t: number) => ({ id, schema: 2, name: 'E ' + id, subject: '', createdAt: t, updatedAt: t, pageCount: 1, questions: [{ id: id + ':q1', number: 1, segments: [{ page: 1 }], answer: 'B', explanation: '', tags: [], choiceCount: 5 }], crop: null, autoCrop: true, keyChecked: true, textStatus: 'none' as const });
const attempt = (id: string, examId: string, ans: string, status: 'active' | 'completed') => ({
  id, schema: 2, name: 'a', examId, mode: 'exam' as const, createdAt: 1, updatedAt: 1, completedAt: status === 'completed' ? 5 : null, status,
  settings: { secPerQ: 90, confidence: false, preset: 'custom', order: 'sequential' as const, selection: 'all', breakMinutes: null },
  blocks: [], currentBlock: 0, phase: status === 'completed' ? ('done' as const) : ('block' as const), breakStartedAt: null, current: 0, paused: false,
  items: [{ qid: examId + ':q1', examId, number: 1, answer: ans, changes: [], timeMs: 0, marked: false, confidence: null, highlights: [], strikes: [], note: '', locked: true, key: 'B', tags: [], reviewNote: '', missReason: null }],
});

describe('data folder', () => {
  it('saves one file per document and a new computer gets everything back by picking the same folder', async () => {
    const A = await computer('folder-A');
    await A.chooseFolder();
    await A.saveExam(exam('e1', 1) as any);
    await A.savePdf('e1', new TextEncoder().encode('%PDF-fake').buffer as ArrayBuffer);
    await A.saveAttempt(attempt('a1', 'e1', 'B', 'completed') as any);
    await A.addRedo('e1:q1', 'e1', 'B', true, 1000);
    await A.flush();
    expect([...(await (await shared.getDirectoryHandle('Test Simulator Data')).getDirectoryHandle('exams')).files.keys()].sort()).toEqual(['e1.json', 'e1.pdf']);
    expect([...(await (await shared.getDirectoryHandle('Test Simulator Data')).getDirectoryHandle('attempts')).files.keys()]).toEqual(['a1.json']);
    const examFile = JSON.parse(await (await (await (await (await shared.getDirectoryHandle('Test Simulator Data')).getDirectoryHandle('exams')).getFileHandle('e1.json')).getFile()).text());
    expect(examFile.schema).toBe(2);

    const B = await computer('folder-B');
    await B.chooseFolder();
    expect((await B.db.exams.get('e1'))?.name).toBe('E e1');
    expect((await B.db.attempts.get('a1'))?.items[0].answer).toBe('B');
    expect(new TextDecoder().decode((await B.db.blobs.get('e1'))!.data)).toBe('%PDF-fake');
    expect((await B.db.reviews.get('e1:q1'))?.redos.length).toBe(1);
  });

  it('merges by ID: work done on two computers is kept, nothing is overwritten', async () => {
    const A = await computer('folder-A');
    await A.chooseFolder();
    const B = await computer('folder-B');
    await B.chooseFolder();
    // B finishes a new attempt and a redo; A edits the exam afterwards
    await B.saveAttempt(attempt('b1', 'e1', 'C', 'completed') as any);
    await B.addRedo('e1:q1', 'e1', 'C', false, 2000);
    await B.flush();
    const A2 = await computer('folder-A');
    await A2.chooseFolder();
    expect((await A2.db.attempts.get('b1'))?.items[0].answer).toBe('C');
    expect((await A2.db.attempts.get('a1'))?.items[0].answer).toBe('B');
    expect((await A2.db.reviews.get('e1:q1'))?.redos.map((r: any) => r.t).sort()).toEqual([1000, 2000]);
  });

  it('a stale in-progress copy never replaces a completed attempt', async () => {
    const A = await computer('folder-C');
    await A.saveAttempt(attempt('b1', 'e1', 'D', 'active') as any);
    await A.chooseFolder();
    expect((await A.db.attempts.get('b1'))?.status).toBe('completed');
  });

  it('deleting on one computer removes the files and the other computer drops it on next sync', async () => {
    const A = await computer('folder-A');
    await A.chooseFolder();
    await A.deleteAttempt('b1');
    await A.flush();
    expect((await (await shared.getDirectoryHandle('Test Simulator Data')).getDirectoryHandle('attempts')).files.has('b1.json')).toBe(false);
    const B = await computer('folder-B');
    await B.chooseFolder();
    expect(await B.db.attempts.get('b1')).toBeUndefined();
    expect(await B.db.attempts.get('a1')).toBeDefined();
  });
});
