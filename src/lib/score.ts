import type { Attempt, AttemptItem, Confidence } from '../types';
import { elapsed } from './timer';

export function isCorrect(it: AttemptItem): boolean {
  return !!it.answer && !!it.key && it.answer === it.key;
}
export function isBlank(it: AttemptItem): boolean {
  return !it.answer;
}

export type ChangeKind = 'right→wrong' | 'wrong→right' | 'wrong→wrong' | null;

/** Compare the first answer chosen with the final answer. */
export function classifyChange(it: AttemptItem): ChangeKind {
  const picks = it.changes.map((c) => c.to).filter((x): x is string => !!x);
  if (picks.length < 2 || !it.key || !it.answer) return null;
  const first = picks[0];
  if (first === it.answer) return null;
  const firstRight = first === it.key;
  const finalRight = it.answer === it.key;
  if (firstRight && !finalRight) return 'right→wrong';
  if (!firstRight && finalRight) return 'wrong→right';
  if (!firstRight && !finalRight) return 'wrong→wrong';
  return null;
}

export interface Bucket {
  label: string;
  correct: number;
  total: number;
}

export interface ScoreReport {
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  pct: number;
  timeMs: number;
  avgMs: number;
  changes: { 'right→wrong': number; 'wrong→right': number; 'wrong→wrong': number };
  byConfidence: Bucket[];
  byTag: Bucket[];
  times: { n: number; ms: number; correct: boolean; blank: boolean }[];
}

export function scoreAttempt(a: Attempt, now = Date.now()): ScoreReport {
  const items = a.items;
  const correct = items.filter(isCorrect).length;
  const blank = items.filter(isBlank).length;
  const total = items.length;
  const changes = { 'right→wrong': 0, 'wrong→right': 0, 'wrong→wrong': 0 };
  for (const it of items) {
    const k = classifyChange(it);
    if (k) changes[k]++;
  }
  const conf: Record<string, Bucket> = {};
  const order: (Confidence | 'none')[] = ['sure', 'unsure', 'guess', 'none'];
  for (const it of items) {
    if (isBlank(it)) continue;
    const k = it.confidence ?? 'none';
    conf[k] ??= { label: k === 'none' ? 'Not rated' : k[0].toUpperCase() + k.slice(1), correct: 0, total: 0 };
    conf[k].total++;
    if (isCorrect(it)) conf[k].correct++;
  }
  const tags: Record<string, Bucket> = {};
  for (const it of items) {
    for (const t of it.tags) {
      tags[t] ??= { label: t, correct: 0, total: 0 };
      tags[t].total++;
      if (isCorrect(it)) tags[t].correct++;
    }
  }
  const blockTime = a.blocks.reduce((s, b) => s + elapsed(b.timer, now), 0);
  const itemTime = items.reduce((s, it) => s + it.timeMs, 0);
  const timeMs = blockTime || itemTime;
  return {
    total,
    correct,
    wrong: total - correct - blank,
    blank,
    pct: total ? (correct / total) * 100 : 0,
    timeMs,
    avgMs: total ? itemTime / total : 0,
    changes,
    byConfidence: order.filter((k) => conf[k]).map((k) => conf[k]),
    byTag: Object.values(tags).sort((x, y) => x.correct / x.total - y.correct / y.total),
    times: items.map((it, i) => ({ n: i + 1, ms: it.timeMs, correct: isCorrect(it), blank: isBlank(it) })),
  };
}

export interface Flip {
  qid: string;
  number: number;
  kind: 'wrong→right' | 'right→wrong';
}

/** Questions whose result flipped between an earlier and a later attempt on the same exam. */
export function flips(prev: Attempt, next: Attempt): Flip[] {
  const before = new Map(prev.items.map((i) => [i.qid, i]));
  const out: Flip[] = [];
  for (const it of next.items) {
    const b = before.get(it.qid);
    if (!b) continue;
    const was = isCorrect(b);
    const is = isCorrect(it);
    if (was !== is) out.push({ qid: it.qid, number: it.number, kind: is ? 'wrong→right' : 'right→wrong' });
  }
  return out.sort((x, y) => x.number - y.number);
}
