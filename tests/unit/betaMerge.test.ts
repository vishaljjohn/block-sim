import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BlockSimDB, db, getMeta } from '../../src/db';
import { bringInBetaHistory, OLD_BETA_DB } from '../../src/lib/betaMerge';

describe('retired beta', () => {
  it('its exams, PDFs, page text and attempts move into the app once, without replacing newer data', async () => {
    const beta = new BlockSimDB(OLD_BETA_DB);
    await beta.exams.put({ id: 'eb', name: 'Beta exam', updatedAt: 5, questions: [{ id: 'q1', number: 1, segments: [{ page: 1 }], answer: 'B', explanation: '', tags: [], choiceCount: 5 }] } as never);
    await beta.blobs.put({ id: 'eb', data: new ArrayBuffer(4) });
    await beta.pages.put({ id: 'eb:1', examId: 'eb', page: 1, source: 'pdf', words: [], autoCrop: null, conf: 100 } as never);
    await beta.attempts.put({ id: 'ab', examId: 'eb', status: 'completed', updatedAt: 5, items: [{ qid: 'q1', answer: 'B' }], blocks: [] } as never);
    beta.close();
    await db.open();
    await db.exams.put({ id: 'eb', name: 'Renamed here later', updatedAt: 9, questions: [] } as never);

    expect(await bringInBetaHistory()).toBeGreaterThan(0);
    expect((await db.exams.get('eb'))?.name).toBe('Renamed here later');
    expect(await db.blobs.get('eb')).toBeTruthy();
    expect(await db.pages.get('eb:1')).toBeTruthy();
    expect((await db.attempts.get('ab'))?.items[0].answer).toBe('B');
    expect(await getMeta('betaMerged', false)).toBe(true);
    // only once
    expect(await bringInBetaHistory()).toBe(0);
  });
});
