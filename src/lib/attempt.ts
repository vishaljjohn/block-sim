import { SCHEMA_VERSION } from '../config';
import { uid } from '../db';
import type { Attempt, AttemptItem, AttemptSettings, BlockState, Confidence, Exam, Highlight, Mode, Question } from '../types';
import * as T from './timer';

export interface Pick {
  exam: Exam;
  q: Question;
}

export interface BlockPlan {
  count: number;
  limitMs: number | null;
}

export function shuffle<X>(a: X[], rnd: () => number = Math.random): X[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newItem(p: Pick): AttemptItem {
  return {
    qid: p.q.id,
    examId: p.exam.id,
    number: p.q.number,
    answer: null,
    changes: [],
    timeMs: 0,
    marked: false,
    confidence: null,
    highlights: [],
    strikes: [],
    note: '',
    locked: false,
    key: null,
    tags: [...p.q.tags],
    reviewNote: '',
    missReason: null,
  };
}

/** Split `total` questions into blocks. */
export function planBlocks(total: number, mode: Mode, secPerQ: number | null, blocks = 1, totalMs: number | null = null, timed = mode === 'exam'): BlockPlan[] {
  const n = Math.max(1, Math.min(blocks, total));
  const out: BlockPlan[] = [];
  let left = total;
  for (let i = 0; i < n; i++) {
    const count = Math.ceil(left / (n - i));
    left -= count;
    const limitMs = !timed ? null : totalMs != null ? Math.round(totalMs / n) : secPerQ != null ? count * secPerQ * 1000 : null;
    out.push({ count, limitMs });
  }
  return out;
}

export function createAttempt(name: string, picks: Pick[], mode: Mode, settings: AttemptSettings, plan: BlockPlan[], now = Date.now()): Attempt {
  const blocks: BlockState[] = [];
  let start = 0;
  for (const b of plan) {
    blocks.push({ start, end: start + b.count, limitMs: b.limitMs, timer: T.newTimer(), ended: false, warned5: false });
    start += b.count;
  }
  const examIds = new Set(picks.map((p) => p.exam.id));
  const a: Attempt = {
    id: uid('a'),
    schema: SCHEMA_VERSION,
    name,
    examId: examIds.size === 1 ? picks[0].exam.id : null,
    mode,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    status: 'active',
    settings,
    blocks,
    currentBlock: 0,
    phase: 'block',
    breakStartedAt: null,
    current: 0,
    paused: false,
    items: picks.map(newItem),
  };
  a.blocks[0].timer = T.start(a.blocks[0].timer, now);
  return a;
}

export const block = (a: Attempt): BlockState => a.blocks[a.currentBlock];

export function selectAnswer(it: AttemptItem, letter: string | null, now: number): AttemptItem {
  if (it.locked || it.answer === letter) return it;
  return { ...it, answer: letter, changes: [...it.changes, { t: now, from: it.answer, to: letter }] };
}

export function toggleStrike(it: AttemptItem, letter: string): AttemptItem {
  const has = it.strikes.includes(letter);
  return { ...it, strikes: has ? it.strikes.filter((x) => x !== letter) : [...it.strikes, letter] };
}

export function setHighlights(it: AttemptItem, highlights: Highlight[]): AttemptItem {
  return { ...it, highlights };
}

export function setConfidence(it: AttemptItem, c: Confidence | null): AttemptItem {
  return { ...it, confidence: it.confidence === c ? null : c };
}

/** Tutor mode: lock the answer and reveal the key for this item. */
export function lockItem(it: AttemptItem, key: string): AttemptItem {
  return { ...it, locked: true, key: key || null };
}

/** Copy the answer key into every item of a finished block so history never depends on later edits. */
export function gradeItems(a: Attempt, from: number, to: number, keyOf: (it: AttemptItem) => string | undefined): void {
  for (let i = from; i < to; i++) {
    const it = a.items[i];
    const k = keyOf(it);
    a.items[i] = { ...it, key: it.key ?? (k ? k : null), locked: true };
  }
}

/** End the current block. Returns what comes next. */
export function endBlock(a: Attempt, now: number, keyOf: (it: AttemptItem) => string | undefined): 'break' | 'done' {
  const b = block(a);
  b.timer = T.pause(b.timer, now);
  b.ended = true;
  a.paused = false;
  gradeItems(a, b.start, b.end, keyOf);
  if (a.currentBlock < a.blocks.length - 1) {
    a.phase = 'break';
    a.breakStartedAt = now;
    return 'break';
  }
  a.phase = 'done';
  a.status = 'completed';
  a.completedAt = now;
  return 'done';
}

export function startNextBlock(a: Attempt, now: number): void {
  a.currentBlock++;
  a.phase = 'block';
  a.breakStartedAt = null;
  a.current = block(a).start;
  block(a).timer = T.start(block(a).timer, now);
}

/** After the answer key is edited, re-grade every completed attempt item for that exam. */
export function regrade(a: Attempt, exam: Exam): boolean {
  const key = new Map(exam.questions.map((q) => [q.id, q.answer]));
  let changed = false;
  a.items = a.items.map((it) => {
    if (it.examId !== exam.id || !it.locked) return it;
    const k = key.get(it.qid);
    if (k === undefined || (k || null) === it.key) return it;
    changed = true;
    return { ...it, key: k || null };
  });
  return changed;
}
