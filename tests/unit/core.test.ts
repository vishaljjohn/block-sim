import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { beat, elapsed, fmtClock, newTimer, pause, remaining, start } from '../../src/lib/timer';
import { computeSchedule, DAY, isDue } from '../../src/lib/schedule';
import { applyTombstones, betterAttempt, mergeById, mergeReviews } from '../../src/lib/merge';
import { addWordRange, boxFromDrag, highlightAt, rectsForRange, removeHighlight, wordAt } from '../../src/lib/highlights';
import { BlockSimDB, migrateAttempt, migrateExam } from '../../src/db';
import { classifyChange, flips, scoreAttempt } from '../../src/lib/score';
import { buildMissedBank, dueRows } from '../../src/lib/missed';
import type { Attempt, AttemptItem, Highlight, Word } from '../../src/types';

describe('timer', () => {
  it('computes from timestamps and pauses', () => {
    let t = start(newTimer(), 1000);
    expect(elapsed(t, 61_000)).toBe(60_000);
    t = pause(t, 61_000);
    expect(elapsed(t, 999_000)).toBe(60_000);
    t = start(t, 1_000_000);
    expect(elapsed(t, 1_030_000)).toBe(90_000);
    expect(remaining(t, 120_000, 1_030_000)).toBe(30_000);
    expect(remaining(t, 120_000, 9_030_000)).toBe(0);
    expect(fmtClock(3_723_000)).toBe('1:02:03');
  });
  it('does not drift with irregular beats', () => {
    let t = start(newTimer(), 0);
    for (const now of [900, 2100, 2950, 59_000, 100_000]) t = beat(t, now).timer;
    expect(elapsed(t, 100_000)).toBe(100_000);
  });
  it('auto-pauses at the moment the computer went to sleep (gap > 60 s)', () => {
    let t = start(newTimer(), 0);
    t = beat(t, 30_000).timer;
    const r = beat(t, 30_000 + 3_600_000);
    expect(r.slept).toBe(true);
    expect(r.timer.runningSince).toBeNull();
    expect(r.timer.autoPaused).toBe(true);
    expect(elapsed(r.timer, 99_999_999)).toBe(30_000);
    const resumed = start(r.timer, 5_000_000);
    expect(resumed.autoPaused).toBe(false);
    expect(elapsed(resumed, 5_010_000)).toBe(40_000);
  });
  it('a 59 s gap is not treated as sleep', () => {
    const t = beat(start(newTimer(), 0), 59_000);
    expect(t.slept).toBe(false);
  });
});

describe('spaced schedule', () => {
  const t0 = new Date(2026, 0, 1, 10).getTime();
  it('first due after 3 days', () => {
    const s = computeSchedule([t0], []);
    expect(s.status).toBe('New');
    expect(s.dueAt).toBe(t0 + 3 * DAY);
    expect(isDue(s, t0 + 2 * DAY)).toBe(false);
    expect(isDue(s, t0 + 3 * DAY)).toBe(true);
  });
  it('3 → 7 → 21 → 60 days and mastery after two correct days', () => {
    const r1 = { t: t0 + 3 * DAY, answer: 'A', correct: true };
    const s1 = computeSchedule([t0], [r1]);
    expect(s1.status).toBe('Reviewing');
    expect(s1.dueAt).toBe(r1.t + 7 * DAY);
    const sameDay = computeSchedule([t0], [r1, { t: r1.t + 3600_000, answer: 'A', correct: true }]);
    expect(sameDay.status).toBe('Reviewing'); // two correct on the SAME day is not mastery
    expect(sameDay.dueAt).toBe(r1.t + 3600_000 + 21 * DAY);
    const s2 = computeSchedule([t0], [r1, { t: r1.t + 7 * DAY, answer: 'A', correct: true }]);
    expect(s2.status).toBe('Mastered');
    expect(s2.dueAt).toBeNull();
  });
  it('a wrong redo resets to 3 days', () => {
    const s = computeSchedule([t0], [
      { t: t0 + 3 * DAY, answer: 'A', correct: true },
      { t: t0 + 10 * DAY, answer: 'B', correct: false },
    ]);
    expect(s.dueAt).toBe(t0 + 13 * DAY);
    expect(s.correctStreakDays).toBe(0);
    expect(s.status).toBe('Reviewing');
  });
});

describe('storage merge', () => {
  const doc = (id: string, updatedAt: number, extra = {}) => ({ id, updatedAt, ...extra });
  it('merges by id, newer wins, nothing is dropped', () => {
    const out = mergeById([doc('a', 1), doc('b', 5, { v: 'local' })], [doc('b', 9, { v: 'remote' }), doc('c', 2)]);
    expect(out.map((d) => d.id).sort()).toEqual(['a', 'b', 'c']);
    expect((out.find((d) => d.id === 'b') as any).v).toBe('remote');
  });
  it('a completed attempt beats a newer in-progress copy', () => {
    const a = { id: 'x', updatedAt: 1, status: 'completed' } as Attempt;
    const b = { id: 'x', updatedAt: 99, status: 'active' } as Attempt;
    expect(mergeById([a], [b], betterAttempt)[0].status).toBe('completed');
  });
  it('review logs are unioned', () => {
    const out = mergeReviews(
      [{ qid: 'q', examId: 'e', updatedAt: 1, redos: [{ t: 1, answer: 'A', correct: true }], reviewedAt: [5] }],
      [{ qid: 'q', examId: 'e', updatedAt: 2, redos: [{ t: 1, answer: 'A', correct: true }, { t: 2, answer: 'B', correct: false }], reviewedAt: [6] }],
    );
    expect(out[0].redos.length).toBe(2);
    expect(out[0].reviewedAt).toEqual([5, 6]);
  });
  it('tombstones remove only documents not changed since deletion', () => {
    expect(applyTombstones([doc('a', 5), doc('b', 50)], [{ id: 'a', t: 10 }, { id: 'b', t: 10 }]).map((d) => d.id)).toEqual(['b']);
  });
});

describe('highlight storage', () => {
  const words: Word[] = [
    { t: 'one', x: 0.1, y: 0.1, w: 0.05, h: 0.02, c: 100 },
    { t: 'two', x: 0.16, y: 0.1, w: 0.05, h: 0.02, c: 100 },
    { t: 'three', x: 0.1, y: 0.13, w: 0.07, h: 0.02, c: 100 },
    { t: 'four', x: 0.18, y: 0.13, w: 0.05, h: 0.02, c: 100 },
  ];
  it('box highlights are page-relative and stray clicks are ignored', () => {
    expect(boxFromDrag(2, 0.5, 0.5, 0.501, 0.501, 'h')).toBeNull();
    expect(boxFromDrag(2, 0.6, 0.4, 0.2, 0.3, 'h')).toMatchObject({ kind: 'box', page: 2, x: 0.2, y: 0.3 });
    const b = boxFromDrag(1, -0.2, 0.1, 1.4, 0.2, 'h')!;
    expect(b.kind === 'box' && b.x === 0 && b.w === 1).toBe(true);
  });
  it('snaps to words and stores ranges, merging overlaps', () => {
    expect(wordAt(words, 0.17, 0.11)).toBe(1);
    expect(wordAt(words, 0.9, 0.9)).toBe(-1);
    let list: Highlight[] = addWordRange([], 1, 1, 0, 'a');
    expect(list).toEqual([{ id: 'a', kind: 'words', page: 1, start: 0, end: 1 }]);
    list = addWordRange(list, 1, 2, 3, 'b');
    expect(list).toEqual([{ id: 'b', kind: 'words', page: 1, start: 0, end: 3 }]);
    list = addWordRange(list, 2, 0, 0, 'c');
    expect(list.length).toBe(2);
    expect(rectsForRange(words, 0, 3).length).toBe(2);
    expect(highlightAt(list, words, 1, 0.2, 0.14)?.id).toBe('b');
    expect(removeHighlight(list, 'b').length).toBe(1);
  });
});

describe('migrations', () => {
  it('v1 exam (pages/region) → segments', () => {
    const e = migrateExam({ id: 'e', name: 'x', questions: [{ id: 'q1', number: 1, pages: [3, 4] }, { id: 'q2', number: 2, pages: [5], region: { page: 5, x: 0, y: 0.5, w: 1, h: 0.5 } }] });
    expect(e.questions[0].segments).toEqual([{ page: 3 }, { page: 4 }]);
    expect(e.questions[1].segments[0].rect?.y).toBe(0.5);
    expect(e.questions[0].tags).toEqual([]);
  });
  it('v1 attempt gets defaults without losing answers', () => {
    const a = migrateAttempt({ id: 'a', status: 'completed', items: [{ qid: 'q1', answer: 'B', highlights: [{ id: 'h', page: 1, x: 0, y: 0, w: 0.1, h: 0.1 }] }], blocks: [{ start: 0, end: 1 }] });
    expect(a.items[0].answer).toBe('B');
    expect(a.items[0].highlights[0].kind).toBe('box');
    expect(a.items[0].reviewNote).toBe('');
    expect(a.phase).toBe('done');
  });
  it('a database created at schema v1 upgrades in place with all data intact', async () => {
    const name = 'migrate-test';
    const old = new Dexie(name);
    old.version(1).stores({ exams: 'id, updatedAt', blobs: 'id', pages: 'id, examId', attempts: 'id, examId, status, updatedAt', reviews: 'qid, examId', snapshots: 'id, createdAt', meta: 'key' });
    await old.table('exams').put({ id: 'e1', name: 'Old exam', updatedAt: 1, questions: [{ id: 'q1', number: 1, pages: [1], answer: 'C' }] });
    await old.table('attempts').put({ id: 'a1', examId: 'e1', status: 'completed', updatedAt: 1, items: [{ qid: 'q1', answer: 'C' }], blocks: [] });
    old.close();
    const db = new BlockSimDB(name);
    const e = await db.exams.get('e1');
    const a = await db.attempts.get('a1');
    expect(e?.questions[0].segments).toEqual([{ page: 1 }]);
    expect(e?.questions[0].answer).toBe('C');
    expect(a?.items[0].answer).toBe('C');
    expect(a?.items[0].changes).toEqual([]);
    db.close();
  });
});

function item(p: Partial<AttemptItem>): AttemptItem {
  return { qid: 'q', examId: 'e', number: 1, answer: null, changes: [], timeMs: 1000, marked: false, confidence: null, highlights: [], strikes: [], note: '', locked: false, key: 'A', tags: [], reviewNote: '', missReason: null, ...p };
}
function attempt(id: string, completedAt: number, items: AttemptItem[]): Attempt {
  return { id, schema: 2, name: id, examId: 'e', mode: 'exam', createdAt: completedAt, updatedAt: completedAt, completedAt, status: 'completed', settings: { secPerQ: 90, confidence: true, preset: 'custom', order: 'sequential', selection: 'all', breakMinutes: null }, blocks: [], currentBlock: 0, phase: 'done', breakStartedAt: null, current: 0, paused: false, items };
}

describe('score + missed bank', () => {
  const ch = (...to: string[]) => to.map((x, i) => ({ t: i, from: i ? to[i - 1] : null, to: x }));
  it('scores and classifies answer changes', () => {
    const a = attempt('a1', 1000, [
      item({ qid: 'q1', answer: 'A', changes: ch('A'), tags: ['Cardio'], confidence: 'sure' }),
      item({ qid: 'q2', answer: 'B', changes: ch('A', 'B'), tags: ['Cardio'], confidence: 'guess' }),
      item({ qid: 'q3', answer: 'A', changes: ch('C', 'A'), tags: ['Renal'] }),
      item({ qid: 'q4', answer: 'C', changes: ch('B', 'C') }),
      item({ qid: 'q5' }),
    ]);
    const s = scoreAttempt(a);
    expect([s.correct, s.wrong, s.blank]).toEqual([2, 2, 1]);
    expect(s.pct).toBe(40);
    expect(s.changes).toEqual({ 'right→wrong': 1, 'wrong→right': 1, 'wrong→wrong': 1 });
    expect(classifyChange(a.items[0])).toBeNull();
    expect(s.byTag.find((b) => b.label === 'Cardio')).toMatchObject({ correct: 1, total: 2 });
    expect(s.byConfidence.find((b) => b.label === 'Guess')).toMatchObject({ correct: 0, total: 1 });
  });
  it('lists wrong, guessed and marked; schedules and masters', () => {
    const t0 = new Date(2026, 0, 1, 9).getTime();
    const a = attempt('a1', t0, [
      item({ qid: 'q1', answer: 'B' }),
      item({ qid: 'q2', answer: 'A', confidence: 'guess' }),
      item({ qid: 'q3', answer: 'A', marked: true }),
      item({ qid: 'q4', answer: 'A' }),
    ]);
    let rows = buildMissedBank([a], []);
    expect(rows.map((r) => r.qid).sort()).toEqual(['q1', 'q2', 'q3']);
    expect(dueRows(rows, t0 + 2 * DAY).length).toBe(0);
    expect(dueRows(rows, t0 + 3 * DAY + 1).length).toBe(3);
    rows = buildMissedBank([a], [{ qid: 'q1', examId: 'e', updatedAt: 1, reviewedAt: [], redos: [{ t: t0 + 3 * DAY, answer: 'A', correct: true }, { t: t0 + 11 * DAY, answer: 'A', correct: true }] }]);
    expect(rows.find((r) => r.qid === 'q1')?.schedule.status).toBe('Mastered');
    // missing it again in a later block resets it
    const b = attempt('a2', t0 + 20 * DAY, [item({ qid: 'q1', answer: 'C' })]);
    rows = buildMissedBank([a, b], [{ qid: 'q1', examId: 'e', updatedAt: 1, reviewedAt: [], redos: [{ t: t0 + 3 * DAY, answer: 'A', correct: true }, { t: t0 + 11 * DAY, answer: 'A', correct: true }] }]);
    const r = rows.find((x) => x.qid === 'q1')!;
    expect(r.timesMissed).toBe(2);
    expect(r.schedule.status).toBe('Reviewing');
    expect(r.schedule.dueAt).toBe(t0 + 23 * DAY);
  });
  it('flips between attempts', () => {
    const a = attempt('a1', 1, [item({ qid: 'q1', answer: 'B' }), item({ qid: 'q2', number: 2, answer: 'A' })]);
    const b = attempt('a2', 2, [item({ qid: 'q1', answer: 'A' }), item({ qid: 'q2', number: 2, answer: 'D' })]);
    expect(flips(a, b).map((f) => f.kind)).toEqual(['wrong→right', 'right→wrong']);
  });
});
