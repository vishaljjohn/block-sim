import type { Attempt, ReviewRecord } from '../types';

export interface Tombstone {
  id: string;
  t: number;
}

/** Merge two sets of documents by ID. The newer copy wins; nothing is ever dropped because the other side lacks it. */
export function mergeById<T extends { id: string; updatedAt: number }>(a: T[], b: T[], better: (x: T, y: T) => T = newer): T[] {
  const out = new Map<string, T>();
  for (const d of [...a, ...b]) {
    const cur = out.get(d.id);
    out.set(d.id, cur ? better(cur, d) : d);
  }
  return [...out.values()];
}

export function newer<T extends { updatedAt: number }>(x: T, y: T): T {
  return y.updatedAt > x.updatedAt ? y : x;
}

/** A completed attempt always beats an in-progress copy of the same attempt; otherwise the newer one wins. */
export function betterAttempt(x: Attempt, y: Attempt): Attempt {
  if (x.status !== y.status) return x.status === 'completed' ? x : y;
  return newer(x, y);
}

export function mergeReviews(a: ReviewRecord[], b: ReviewRecord[]): ReviewRecord[] {
  const out = new Map<string, ReviewRecord>();
  for (const r of [...a, ...b]) {
    const cur = out.get(r.qid);
    if (!cur) {
      out.set(r.qid, { ...r, redos: [...r.redos], reviewedAt: [...r.reviewedAt] });
      continue;
    }
    const redos = new Map(cur.redos.map((x) => [x.t, x]));
    for (const x of r.redos) if (!redos.has(x.t)) redos.set(x.t, x);
    cur.redos = [...redos.values()].sort((p, q) => p.t - q.t);
    cur.reviewedAt = [...new Set([...cur.reviewedAt, ...r.reviewedAt])].sort((p, q) => p - q);
    cur.updatedAt = Math.max(cur.updatedAt, r.updatedAt);
  }
  return [...out.values()];
}

export function mergeTombstones(a: Tombstone[], b: Tombstone[]): Tombstone[] {
  const out = new Map<string, number>();
  for (const t of [...a, ...b]) out.set(t.id, Math.max(out.get(t.id) ?? 0, t.t));
  return [...out.entries()].map(([id, t]) => ({ id, t }));
}

/** Drop documents deleted (on any computer) after they were last changed. */
export function applyTombstones<T extends { id: string; updatedAt: number }>(docs: T[], tombs: Tombstone[]): T[] {
  const m = new Map(tombs.map((t) => [t.id, t.t]));
  return docs.filter((d) => !(m.has(d.id) && m.get(d.id)! >= d.updatedAt));
}
