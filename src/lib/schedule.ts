import { REVIEW_INTERVAL_DAYS } from '../config';
import type { Redo } from '../types';

export const DAY = 86_400_000;
export type BankStatus = 'New' | 'Reviewing' | 'Mastered';

export interface ScheduleState {
  status: BankStatus;
  stage: number;
  dueAt: number | null;
  correctStreakDays: number;
}

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Spaced schedule: due 3, 7, 21, 60 days after the last event.
 * A wrong redo (or missing the question again in a block) resets to 3 days.
 * Two correct redos on different calendar days (with no miss between) → Mastered.
 */
export function computeSchedule(missTimes: number[], redos: Redo[], reviewed = false): ScheduleState {
  type Ev = { t: number; kind: 'miss' | 'right' | 'wrong' };
  const evs: Ev[] = [
    ...missTimes.map((t) => ({ t, kind: 'miss' as const })),
    ...redos.map((r) => ({ t: r.t, kind: r.correct ? ('right' as const) : ('wrong' as const) })),
  ].sort((a, b) => a.t - b.t);
  let stage = 0;
  let dueAt: number | null = null;
  let correctDays = new Set<string>();
  let touched = reviewed;
  for (const ev of evs) {
    if (ev.kind === 'miss' || ev.kind === 'wrong') {
      stage = 0;
      correctDays = new Set();
      dueAt = ev.t + REVIEW_INTERVAL_DAYS[0] * DAY;
      if (ev.kind === 'wrong') touched = true;
    } else {
      touched = true;
      correctDays.add(dayKey(ev.t));
      stage = Math.min(stage + 1, REVIEW_INTERVAL_DAYS.length - 1);
      dueAt = ev.t + REVIEW_INTERVAL_DAYS[stage] * DAY;
    }
  }
  const mastered = correctDays.size >= 2;
  return {
    status: mastered ? 'Mastered' : touched ? 'Reviewing' : 'New',
    stage,
    dueAt: mastered ? null : dueAt,
    correctStreakDays: correctDays.size,
  };
}

export function isDue(s: ScheduleState, now: number): boolean {
  return s.dueAt != null && s.dueAt <= now;
}
