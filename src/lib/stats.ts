import type { Attempt, Exam } from '../types';
import { isBlank, isCorrect, scoreAttempt } from './score';

/** What is known about one question across every attempt (finished blocks, plus answers in unfinished ones). */
export interface QStat {
  used: boolean;
  /** result of the last finished attempt that included it */
  last: 'correct' | 'incorrect' | 'omitted' | null;
  marked: boolean;
  times: number;
}

export function questionStats(attempts: Attempt[]): Map<string, QStat> {
  const out = new Map<string, QStat>();
  const sorted = [...attempts].sort((a, b) => (a.completedAt ?? a.updatedAt) - (b.completedAt ?? b.updatedAt));
  for (const a of sorted) {
    for (const it of a.items) {
      const s = out.get(it.qid) ?? { used: false, last: null, marked: false, times: 0 };
      if (it.answer || a.status === 'completed') s.used = true;
      if (a.status === 'completed') {
        s.last = isBlank(it) ? 'omitted' : isCorrect(it) ? 'correct' : 'incorrect';
        s.times++;
      }
      if (it.marked) s.marked = true;
      out.set(it.qid, s);
    }
  }
  return out;
}

export interface Progress {
  total: number;
  correct: number;
  incorrect: number;
  omitted: number;
  remaining: number;
  answered: number;
  accuracy: number | null;
  completedPct: number;
}

export function progressOf(qids: string[], qs: Map<string, QStat>): Progress {
  let correct = 0;
  let incorrect = 0;
  let omitted = 0;
  for (const id of qids) {
    const s = qs.get(id);
    if (s?.last === 'correct') correct++;
    else if (s?.last === 'incorrect') incorrect++;
    else if (s?.last === 'omitted') omitted++;
  }
  const answered = correct + incorrect;
  const done = correct + incorrect + omitted;
  return { total: qids.length, correct, incorrect, omitted, remaining: Math.max(0, qids.length - done), answered, accuracy: answered ? (correct / answered) * 100 : null, completedPct: qids.length ? (done / qids.length) * 100 : 0 };
}

export const folderOf = (e: Exam) => e.subject?.trim() || 'No folder';

/** Accuracy and progress per folder (subject). */
export function folderStats(exams: Exam[], qs: Map<string, QStat>): { name: string; p: Progress }[] {
  const by = new Map<string, string[]>();
  for (const e of exams) {
    if (e.isDemo) continue;
    const k = folderOf(e);
    (by.get(k) ?? by.set(k, []).get(k)!).push(...e.questions.map((q) => q.id));
  }
  return [...by.entries()].map(([name, ids]) => ({ name, p: progressOf(ids, qs) })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Time spent answering, in ms (optionally only for one exam, or since a time). */
export function timeStudied(attempts: Attempt[], examId?: string, since = 0): number {
  let ms = 0;
  for (const a of attempts) {
    if ((a.completedAt ?? a.updatedAt) < since) continue;
    for (const it of a.items) if (!examId || it.examId === examId) ms += it.timeMs;
  }
  return ms;
}

/** Score of each finished block, oldest first. */
export function scoreSeries(attempts: Attempt[], examId?: string): { t: number; pct: number; name: string }[] {
  return attempts
    .filter((a) => a.status === 'completed' && (!examId || a.items.some((i) => i.examId === examId)))
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))
    .map((a) => ({ t: a.completedAt ?? a.updatedAt, pct: scoreAttempt(a).pct, name: a.name }));
}

/** Study time per day for the last `days` days (ms), oldest first. */
export function studyByDay(attempts: Attempt[], days: number, now = Date.now()): { day: number; ms: number }[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const first = start.getTime() - (days - 1) * 86_400_000;
  const out = Array.from({ length: days }, (_, i) => ({ day: first + i * 86_400_000, ms: 0 }));
  for (const a of attempts) {
    const t = a.completedAt ?? a.updatedAt;
    if (t < first) continue;
    const k = Math.min(days - 1, Math.floor((t - first) / 86_400_000));
    out[k].ms += a.items.reduce((s, it) => s + it.timeMs, 0);
  }
  return out;
}

export function assessment(acc: number | null): { label: string; tone: 'good' | 'mid' | 'bad' | 'none'; text: string } {
  if (acc == null) return { label: 'No data', tone: 'none', text: 'Finish a block to see where you stand.' };
  if (acc >= 70) return { label: 'Strong', tone: 'good', text: 'Strong performance. Keep the momentum and mix in timed blocks.' };
  if (acc >= 58) return { label: 'On track', tone: 'mid', text: 'On track. Review your missed questions to push higher.' };
  return { label: 'At risk', tone: 'bad', text: 'Significant improvement needed. Focus on your weakest folders and review every miss.' };
}

export function fmtHours(ms: number): string {
  const m = Math.round(ms / 60_000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
