import type { Highlight, Rect, Word } from '../types';

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Box highlight from two drag corners, in page fractions. Returns null for a stray click. */
export function boxFromDrag(page: number, x0: number, y0: number, x1: number, y1: number, id: string): Highlight | null {
  const x = clamp(Math.min(x0, x1));
  const y = clamp(Math.min(y0, y1));
  const w = clamp(Math.max(x0, x1)) - x;
  const h = clamp(Math.max(y0, y1)) - y;
  if (w < 0.008 || h < 0.004) return null;
  return { id, kind: 'box', page, x, y, w, h };
}

/** Index of the word under (or nearest on the same line to) a point; -1 if nothing is close. */
export function wordAt(words: Word[], x: number, y: number, slack = 0.012): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (y < w.y - w.h * 0.4 || y > w.y + w.h * 1.4) continue;
    const dx = x < w.x ? w.x - x : x > w.x + w.w ? x - (w.x + w.w) : 0;
    if (dx < bestD) {
      bestD = dx;
      best = i;
    }
  }
  return bestD <= slack ? best : -1;
}

/** Add a word-range highlight, merging with any ranges it touches on the same page. */
export function addWordRange(list: Highlight[], page: number, a: number, b: number, id: string): Highlight[] {
  let start = Math.min(a, b);
  let end = Math.max(a, b);
  const rest: Highlight[] = [];
  for (const h of list) {
    if (h.kind === 'words' && h.page === page && h.start <= end + 1 && h.end >= start - 1) {
      start = Math.min(start, h.start);
      end = Math.max(end, h.end);
    } else rest.push(h);
  }
  return [...rest, { id, kind: 'words', page, start, end }];
}

export function removeHighlight(list: Highlight[], id: string): Highlight[] {
  return list.filter((h) => h.id !== id);
}

/** Rectangles (one per text line) covering a word range. */
export function rectsForRange(words: Word[], start: number, end: number): Rect[] {
  const out: Rect[] = [];
  let cur: Rect | null = null;
  for (let i = Math.max(0, start); i <= Math.min(words.length - 1, end); i++) {
    const w = words[i];
    if (cur && Math.abs(w.y + w.h / 2 - (cur.y + cur.h / 2)) < Math.max(cur.h, w.h) * 0.6 && w.x >= cur.x - 0.01) {
      const r = Math.max(cur.x + cur.w, w.x + w.w);
      const top = Math.min(cur.y, w.y);
      const bot = Math.max(cur.y + cur.h, w.y + w.h);
      cur.w = r - cur.x;
      cur.y = top;
      cur.h = bot - top;
    } else {
      cur = { x: w.x, y: w.y, w: w.w, h: w.h };
      out.push(cur);
    }
  }
  return out;
}

export function highlightAt(list: Highlight[], words: Word[] | undefined, page: number, x: number, y: number): Highlight | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    if (h.page !== page) continue;
    const rects = h.kind === 'box' ? [h] : words ? rectsForRange(words, h.start, h.end) : [];
    if (rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y - 0.002 && y <= r.y + r.h + 0.002)) return h;
  }
  return null;
}
