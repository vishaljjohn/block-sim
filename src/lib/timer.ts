import { SLEEP_GAP_MS } from '../config';
import type { TimerState } from '../types';

/** All timing is computed from wall-clock timestamps, never from tick counts, so it cannot drift. */
export function newTimer(): TimerState {
  return { elapsedMs: 0, runningSince: null, lastBeat: null, autoPaused: false };
}

export function elapsed(t: TimerState, now: number): number {
  return t.elapsedMs + (t.runningSince != null ? Math.max(0, now - t.runningSince) : 0);
}

export function start(t: TimerState, now: number): TimerState {
  if (t.runningSince != null) return t;
  return { ...t, runningSince: now, lastBeat: now, autoPaused: false };
}

export function pause(t: TimerState, now: number): TimerState {
  if (t.runningSince == null) return t;
  return { ...t, elapsedMs: elapsed(t, now), runningSince: null, lastBeat: now };
}

/**
 * Called every second while the block is on screen (and once on load).
 * If more than 60 s passed since the last beat, the computer slept or the app was closed:
 * stop the clock at the moment it went away.
 */
export function beat(t: TimerState, now: number, gapMs = SLEEP_GAP_MS): { timer: TimerState; slept: boolean; lostMs: number } {
  if (t.runningSince == null) return { timer: t, slept: false, lostMs: 0 };
  const last = t.lastBeat ?? t.runningSince;
  if (now - last > gapMs) {
    const at = Math.max(last, t.runningSince);
    return {
      timer: { elapsedMs: t.elapsedMs + (at - t.runningSince), runningSince: null, lastBeat: at, autoPaused: true },
      slept: true,
      lostMs: now - at,
    };
  }
  return { timer: { ...t, lastBeat: now }, slept: false, lostMs: 0 };
}

export function remaining(t: TimerState, limitMs: number | null, now: number): number | null {
  if (limitMs == null) return null;
  return Math.max(0, limitMs - elapsed(t, now));
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
