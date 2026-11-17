import type { Highlight, HighlightColor, Rect, Word } from '../types';

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Box highlight from two drag corners, in page fractions. Returns null for a stray click. */
export function boxFromDrag(page: number, x0: number, y0: number, x1: number, y1: number, id: string, color?: HighlightColor): Highlight | null {
  const x = clamp(Math.min(x0, x1));
  const y = clamp(Math.min(y0, y1));
  const w = clamp(Math.max(x0, x1)) - x;
  const h = clamp(Math.max(y0, y1)) - y;
  if (w < 0.008 || h < 0.004) return null;
  return { id, kind: 'box', page, x, y, w, h, ...(color && color !== 'yellow' ? { color } : {}) };
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

/** A position inside the text: word index + character offset in that word. */
export interface TextPos {
  w: number;
  c: number;
}
const before = (a: TextPos, b: TextPos) => a.w < b.w || (a.w === b.w && a.c < b.c);

/** Character offset inside a word for an x position (characters assumed equally wide). */
export function charAt(word: Word, x: number): number {
  const n = word.t.length;
  return Math.max(0, Math.min(n, Math.round(((x - word.x) / Math.max(word.w, 1e-6)) * n)));
}

/**
 * Add a highlight from text position a to b (either order). Touching or overlapping ranges of the same color join
 * up; other colors stay as they are. Whole words are stored without character offsets.
 */
export function addWordRange(list: Highlight[], page: number, a: number | TextPos, b: number | TextPos, id: string, color?: HighlightColor, words?: Word[]): Highlight[] {
  const len = (w: number) => words?.[w]?.t.length ?? Infinity;
  let s: TextPos;
  let e: TextPos;
  if (typeof a === 'number' && typeof b === 'number') {
    // whole words
    s = { w: Math.min(a, b), c: 0 };
    e = { w: Math.max(a, b), c: Infinity };
  } else {
    s = typeof a === 'number' ? { w: a, c: 0 } : a;
    e = typeof b === 'number' ? { w: b, c: Infinity } : b;
    if (before(e, s)) [s, e] = [e, s];
  }
  const rest: Highlight[] = [];
  for (const h of list) {
    if (h.kind !== 'words' || h.page !== page || (h.color ?? 'yellow') !== (color ?? 'yellow')) {
      rest.push(h);
      continue;
    }
    const hs: TextPos = { w: h.start, c: h.sc ?? 0 };
    const he: TextPos = { w: h.end, c: h.ec ?? Infinity };
    // touching: same or neighbouring words
    if (h.start <= e.w + 1 && h.end >= s.w - 1) {
      if (before(hs, s)) s = hs;
      if (before(e, he)) e = he;
    } else rest.push(h);
  }
  const out: Highlight = { id, kind: 'words', page, start: s.w, end: e.w, ...(color && color !== 'yellow' ? { color } : {}) };
  if (s.c > 0 && s.c < len(s.w)) out.sc = s.c;
  if (e.c !== Infinity && e.c < len(e.w)) out.ec = Math.max(e.c, s.w === e.w ? (out.sc ?? 0) + 1 : 1);
  return [...rest, out];
}

export function removeHighlight(list: Highlight[], id: string): Highlight[] {
  return list.filter((h) => h.id !== id);
}

/** Rectangles (one per text line) covering a word range; sc/ec trim the first/last word to characters. */
export function rectsForRange(words: Word[], start: number, end: number, sc?: number, ec?: number): Rect[] {
  const out: Rect[] = [];
  let cur: Rect | null = null;
  for (let i = Math.max(0, start); i <= Math.min(words.length - 1, end); i++) {
    let w = words[i];
    const n = w.t.length || 1;
    const c0 = i === start && sc ? sc : 0;
    const c1 = i === end && ec != null ? ec : n;
    if (c0 > 0 || c1 < n) w = { ...w, x: w.x + (w.w * c0) / n, w: (w.w * Math.max(1, c1 - c0)) / n };
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
    const rects = h.kind === 'box' ? [h] : words ? rectsForRange(words, h.start, h.end, h.sc, h.ec) : [];
    if (rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y - 0.002 && y <= r.y + r.h + 0.002)) return h;
  }
  return null;
}
