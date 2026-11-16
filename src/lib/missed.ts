import type { Attempt, MissReason, ReviewRecord } from '../types';
import { computeSchedule, type ScheduleState } from './schedule';
import { isCorrect } from './score';

export interface MissedRow {
  qid: string;
  examId: string;
  number: number;
  tags: string[];
  missedAt: number;
  myAnswer: string | null;
  key: string | null;
  why: ('wrong' | 'guess' | 'marked')[];
  reason: MissReason | null;
  timesMissed: number;
  lastReviewed: number | null;
  schedule: ScheduleState;
  /** attempt + item of the most recent miss, for opening the original markings */
  attemptId: string;
  itemIndex: number;
}

/** Cross-exam list of every question answered wrong, guessed, or marked in a completed block. */
export function buildMissedBank(attempts: Attempt[], reviews: ReviewRecord[]): MissedRow[] {
  const byQ = new Map<string, MissedRow>();
  const missTimes = new Map<string, number[]>();
  const rightTimes = new Map<string, number[]>();
  const done = attempts.filter((a) => a.status === 'completed').sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  for (const a of done) {
    const t = a.completedAt ?? a.updatedAt;
    a.items.forEach((it, itemIndex) => {
      if (!it.key) return; // ungraded (no answer key) questions cannot be "missed"
      const wrong = !isCorrect(it);
      const guess = it.confidence === 'guess';
      const why: MissedRow['why'] = [];
      if (wrong) why.push('wrong');
      if (guess) why.push('guess');
      if (it.marked) why.push('marked');
      if (!why.length) {
        if (byQ.has(it.qid)) (rightTimes.get(it.qid) ?? rightTimes.set(it.qid, []).get(it.qid)!).push(t);
        return;
      }
      const prev = byQ.get(it.qid);
      if (wrong) (missTimes.get(it.qid) ?? missTimes.set(it.qid, []).get(it.qid)!).push(t);
      else if (!prev) (missTimes.get(it.qid) ?? missTimes.set(it.qid, []).get(it.qid)!).push(t);
      byQ.set(it.qid, {
        qid: it.qid,
        examId: it.examId,
        number: it.number,
        tags: it.tags,
        missedAt: t,
        myAnswer: it.answer,
        key: it.key,
        why,
        reason: it.missReason ?? prev?.reason ?? null,
        timesMissed: (prev?.timesMissed ?? 0) + (wrong ? 1 : 0),
        lastReviewed: prev?.lastReviewed ?? null,
        schedule: prev?.schedule ?? computeSchedule([], []),
        attemptId: a.id,
        itemIndex,
      });
    });
  }
  const rev = new Map(reviews.map((r) => [r.qid, r]));
  for (const row of byQ.values()) {
    const r = rev.get(row.qid);
    const redos = [...(r?.redos ?? []), ...(rightTimes.get(row.qid) ?? []).map((t) => ({ t, answer: row.key ?? '', correct: true }))];
    const reviewedAt = r?.reviewedAt ?? [];
    row.schedule = computeSchedule(missTimes.get(row.qid) ?? [row.missedAt], redos, reviewedAt.length > 0);
    const times = [...reviewedAt, ...(r?.redos ?? []).map((x) => x.t)];
    row.lastReviewed = times.length ? Math.max(...times) : null;
  }
  return [...byQ.values()].sort((a, b) => b.missedAt - a.missedAt);
}

export function dueRows(rows: MissedRow[], now: number): MissedRow[] {
  return rows.filter((r) => r.schedule.dueAt != null && r.schedule.dueAt <= now);
}
