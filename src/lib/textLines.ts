import type { Word } from '../types';
import type { KeyLine } from './keyParser';
import { stripRepeatedLines } from './keyParser';

export interface Line {
  text: string;
  /** indices into the page's word array, left to right */
  idx: number[];
  x: number;
  y: number;
  w: number;
  h: number;
  column: number;
  conf: number;
}

/** Find column gutters: vertical bands almost no word crosses, with real text on both sides. Returns split x positions. */
export function detectColumns(words: Word[]): number[] {
  if (words.length < 30) return [];
  const BINS = 200;
  const cover = new Array<number>(BINS).fill(0);
  let minX = 1;
  let maxX = 0;
  for (const w of words) {
    minX = Math.min(minX, w.x);
    maxX = Math.max(maxX, w.x + w.w);
    const a = Math.max(0, Math.floor(w.x * BINS));
    const b = Math.min(BINS - 1, Math.floor((w.x + w.w) * BINS));
    for (let i = a; i <= b; i++) cover[i]++;
  }
  const span = maxX - minX;
  if (span < 0.4) return [];
  const allow = Math.max(1, Math.floor(words.length * 0.01));
  const splits: number[] = [];
  let i = Math.floor((minX + span * 0.2) * BINS);
  const end = Math.floor((minX + span * 0.8) * BINS);
  while (i <= end) {
    if (cover[i] <= allow) {
      let j = i;
      while (j <= end && cover[j] <= allow) j++;
      const width = (j - i) / BINS;
      if (width >= 0.018) {
        const mid = (i + j) / 2 / BINS;
        const left = words.filter((w) => w.x + w.w / 2 < mid);
        const right = words.filter((w) => w.x + w.w / 2 >= mid);
        const rows = (ws: Word[]) => new Set(ws.map((w) => Math.round((w.y + w.h / 2) * 150))).size;
        if (left.length >= words.length * 0.15 && right.length >= words.length * 0.15 && rows(left) >= 6 && rows(right) >= 6) {
          // rows that have words on both sides must be the norm, otherwise it is just ragged text
          const lr = new Set(left.map((w) => Math.round((w.y + w.h / 2) * 60)));
          let both = 0;
          const rr = new Set(right.map((w) => Math.round((w.y + w.h / 2) * 60)));
          for (const r of rr) if (lr.has(r) || lr.has(r - 1) || lr.has(r + 1)) both++;
          if (both >= rr.size * 0.4) splits.push(mid);
        }
      }
      i = j;
    } else i++;
  }
  return splits.slice(0, 2);
}

function clusterLines(words: Word[], idxs: number[], column: number): Line[] {
  const sorted = [...idxs].sort((a, b) => words[a].y + words[a].h / 2 - (words[b].y + words[b].h / 2));
  const groups: number[][] = [];
  let cy = -1;
  let ch = 0;
  for (const i of sorted) {
    const w = words[i];
    const c = w.y + w.h / 2;
    if (groups.length && Math.abs(c - cy) < Math.max(ch, w.h) * 0.5) {
      const g = groups[groups.length - 1];
      g.push(i);
      cy = (cy * (g.length - 1) + c) / g.length;
      ch = Math.max(ch, w.h);
    } else {
      groups.push([i]);
      cy = c;
      ch = w.h;
    }
  }
  return groups.map((g) => {
    g.sort((a, b) => words[a].x - words[b].x);
    const x = Math.min(...g.map((i) => words[i].x));
    const y = Math.min(...g.map((i) => words[i].y));
    const r = Math.max(...g.map((i) => words[i].x + words[i].w));
    const b = Math.max(...g.map((i) => words[i].y + words[i].h));
    return {
      text: g.map((i) => words[i].t).join(' '),
      idx: g,
      x,
      y,
      w: r - x,
      h: b - y,
      column,
      conf: Math.min(...g.map((i) => words[i].c)) / 100,
    };
  });
}

/** Rebuild reading-order lines from positioned words (by y, then x), column by column. */
export function buildLines(words: Word[]): Line[] {
  const splits = detectColumns(words);
  const cols: number[][] = Array.from({ length: splits.length + 1 }, () => []);
  words.forEach((w, i) => {
    if (!w.t.trim()) return;
    const c = w.x + w.w / 2;
    let k = 0;
    while (k < splits.length && c >= splits[k]) k++;
    cols[k].push(i);
  });
  return cols.flatMap((idxs, k) => clusterLines(words, idxs, k));
}

/** Flatten pages into parser lines, with blank lines at paragraph gaps and page furniture removed. */
export function pagesToKeyLines(pages: { page: number; words: Word[] }[]): KeyLine[] {
  const perPage = pages.map((p) => {
    const lines = buildLines(p.words);
    const out: (KeyLine & { text: string })[] = [];
    lines.forEach((l, i) => {
      const prev = lines[i - 1];
      if (prev && prev.column === l.column && l.y - (prev.y + prev.h) > Math.max(prev.h, l.h) * 0.8) out.push({ text: '', page: p.page });
      out.push({ text: l.text, page: p.page, conf: l.conf, top: false });
    });
    return out;
  });
  const cleaned = stripRepeatedLines(perPage);
  const flat: KeyLine[] = [];
  for (const p of cleaned) {
    let k = 0;
    for (const l of p) {
      if (l.text !== '') {
        l.top = k < 4;
        k++;
      }
      flat.push(l);
    }
    flat.push({ text: '' });
  }
  return flat;
}
