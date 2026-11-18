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
  return markTableLabels(cols.flatMap((idxs, k) => clusterLines(words, idxs, k)));
}

const BARE = /^[|[\]\s]*\(?([A-Z])\)?\s*[|\]]*\s+(\S.*)$/;
/**
 * Answer choices set in a table ("A | Aspirin") have no "." or ")" after the letter. A bare capital letter can also
 * start a sentence ("A 30-year-old…"), so only a run of 3+ lines at the same left edge lettered A, B, C… in order
 * counts; those lines are rewritten as "A) Aspirin" so everything downstream reads them as choices.
 */
export function markTableLabels(lines: Line[]): Line[] {
  const byCol = new Map<number, Line[]>();
  for (const l of lines) (byCol.get(l.column) ?? byCol.set(l.column, []).get(l.column)!).push(l);
  for (const col of byCol.values()) {
    col.sort((a, b) => a.y - b.y);
    for (let i = 0; i < col.length; i++) {
      const m = BARE.exec(col[i].text);
      // a run usually starts at A; one continued from the previous page starts later (E, F…) and needs 2+ lines
      if (!m || m[1] > 'J' || m[1] === 'I') continue;
      const run = [i];
      let next = String.fromCharCode(m[1].charCodeAt(0) + 1);
      for (let k = i + 1; k < col.length && run.length < 26; k++) {
        const mk = BARE.exec(col[k].text);
        if (mk && mk[1] === next && Math.abs(col[k].x - col[i].x) < 0.03) {
          run.push(k);
          next = String.fromCharCode(next.charCodeAt(0) + 1);
        } else if (mk || Math.abs(col[k].x - col[i].x) < 0.03) break;
      }
      if (run.length < (m[1] === 'A' ? 3 : 2)) continue;
      for (const k of run) {
        const mk = BARE.exec(col[k].text)!;
        col[k].text = `${mk[1]}) ${mk[2]}`;
      }
      i = run[run.length - 1];
    }
  }
  return lines;
}

/** Flatten pages into parser lines, with blank lines at paragraph gaps and page furniture removed. */
/**
 * A short number or scrap at the start of a line, far from the rest of it, belongs to something beside the text
 * (the question list down the side of an exam screenshot): "39   Correct Answer: E." is "Correct Answer: E.".
 */
export function dropSidebarToken(l: Line, words: Word[]): string {
  if (l.idx.length < 2) return l.text;
  const [a, b] = [words[l.idx[0]], words[l.idx[1]]];
  const gap = b.x - (a.x + a.w);
  if (a.t.length <= 3 && /^[\W\d]*\d[\W\d]*$|^[^A-Za-z]{1,3}$/.test(a.t) && gap > 0.05 && /^[A-Za-z(]/.test(b.t)) return l.idx.slice(1).map((i) => words[i].t).join(' ');
  return l.text;
}

export function pagesToKeyLines(pages: { page: number; words: Word[] }[]): KeyLine[] {
  const perPage = pages.map((p) => {
    const lines = buildLines(p.words);
    const out: (KeyLine & { text: string })[] = [];
    lines.forEach((l, i) => {
      const prev = lines[i - 1];
      if (prev && prev.column === l.column && l.y - (prev.y + prev.h) > Math.max(prev.h, l.h) * 0.8) out.push({ text: '', page: p.page });
      out.push({ text: dropSidebarToken(l, p.words), page: p.page, conf: l.conf, top: false });
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
