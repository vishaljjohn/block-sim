/**
 * Page understanding from positioned words (PDF text or OCR). Pure functions: no DOM, no pdf.js.
 *  - question starts ("1.", "1)", "Q1", "Question 1", or an "Item N of M" header)
 *  - answer choices ("A)", "A.", "(A)", "a.", … through Z) → clickable regions
 *  - inline answers ("Answer: C" after a question) → hidden from the question, used as the key
 */
import type { ChoiceRegion, Rect, Word } from '../types';
import { ANSWER_RE, ITEM_OF_RE } from './keyParser';
import { buildLines, type Line } from './textLines';

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Optional radio-button glyph that OCR reads in front of a choice letter. */
const RADIO = '(?:[O0o©®○◯●◉◎@¤]\\s*|[(\\[]\\s*[)\\]]\\s*)?';
const CHOICE_RE = new RegExp(`^${RADIO}(?:\\(([A-Za-z])\\)|([A-Za-z])\\s?[.):])(?:\\s+|$)(.*)$`);
const START_RES = [/^(?:Q(?:uestion)?\s*#?\s*)?(\d{1,3})\s*[.):]\s*(\S.*)?$/i, /^Question\s*#?\s*(\d{1,3})\b(.*)$/i, /^Q\s*(\d{1,3})\b(.*)$/];

export function matchChoiceLabel(text: string): { letter: string; rest: string } | null {
  const m = CHOICE_RE.exec(text.trim());
  if (!m) return null;
  const letter = (m[1] ?? m[2]).toUpperCase();
  return { letter, rest: (m[3] ?? '').trim() };
}

export function matchQuestionStart(text: string): number | null {
  const t = text.trim();
  for (const re of START_RES) {
    const m = re.exec(t);
    if (m) {
      const n = parseInt(m[1], 10);
      // "1. A) …" is a choice line, "12.5 mg" is a number
      if (/^\d{1,3}\.\d/.test(t)) return null;
      return n >= 1 ? n : null;
    }
  }
  return null;
}

export interface PageLines {
  page: number;
  words: Word[];
  lines: Line[];
  /** left edge of each column (fraction of page width) */
  colLeft: number[];
  colRight: number[];
  /** content area of the page (auto-crop), if known */
  content: Rect | null;
}

export function pageLines(page: number, words: Word[], content: Rect | null = null): PageLines {
  const lines = buildLines(words).filter((l) => !content || inside(l, content, 0.5));
  const cols = new Map<number, { l: number; r: number }>();
  for (const l of lines) {
    const c = cols.get(l.column) ?? { l: 1, r: 0 };
    c.l = Math.min(c.l, l.x);
    c.r = Math.max(c.r, l.x + l.w);
    cols.set(l.column, c);
  }
  const n = Math.max(0, ...lines.map((l) => l.column + 1));
  const colLeft = Array.from({ length: n }, (_, i) => cols.get(i)?.l ?? 0);
  const colRight = Array.from({ length: n }, (_, i) => cols.get(i)?.r ?? 1);
  return { page, words, lines, colLeft, colRight, content };
}

function inside(r: Rect, c: Rect, frac: number): boolean {
  const cx = r.x + r.w * frac;
  const cy = r.y + r.h / 2;
  return cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h;
}

/** Reading-order sort of words (column, line, x); stored this way so word ranges map to text order. */
export function readingOrder(words: Word[]): Word[] {
  return buildLines(words).flatMap((l) => l.idx.map((i) => words[i]));
}

// --------------------------------------------------------------------------- choices
export interface ChoiceDetection {
  choices: ChoiceRegion[];
  texts: { letter: string; text: string }[];
  confidence: number;
}

/**
 * Find the answer choices among the lines of one question region.
 * Rules: a run of choice lines lettered A, B, C… in order, top to bottom, with left-aligned labels.
 * The last such run in the region wins (choices come after the stem).
 */
export function detectChoices(lines: Line[], page: number, region: Rect | null = null, words?: Word[]): ChoiceDetection {
  const ls = lines.filter((l) => !region || inside(l, region, 0.02)).sort((a, b) => a.column - b.column || a.y - b.y);
  const cands = ls.map((l, i) => ({ i, l, m: matchChoiceLabel(l.text) })).filter((c) => c.m);
  let best: typeof cands = [];
  for (let s = 0; s < cands.length; s++) {
    if (cands[s].m!.letter !== 'A') continue;
    const run = [cands[s]];
    for (let k = s + 1; k < cands.length; k++) {
      const prev = run[run.length - 1];
      const c = cands[k];
      const want = LETTERS[run.length];
      if (c.m!.letter !== want) {
        if (c.m!.letter === 'A') break;
        continue; // a stray line (e.g. continuation) that happens to look like a label
      }
      const sameCol = c.l.column === prev.l.column;
      const aligned = Math.abs(c.l.x - run[0].l.x) < 0.035 || !sameCol;
      const below = !sameCol || c.l.y > prev.l.y + prev.l.h * 0.5;
      // choices are close together: a big gap means it is something else
      const gapOk = !sameCol || c.l.y - (prev.l.y + prev.l.h) < Math.max(0.12, prev.l.h * 8);
      if (!aligned || !below || !gapOk) break;
      run.push(c);
    }
    if (run.length >= 2 && run.length >= best.length * 0.6) best = run;
  }
  if (best.length < 2) return { choices: [], texts: [], confidence: 0 };

  const choices: ChoiceRegion[] = [];
  const texts: { letter: string; text: string }[] = [];
  const lineH = median(best.map((c) => c.l.h));
  best.forEach((c, k) => {
    const next = best[k + 1];
    const labelX = c.l.x;
    // continuation lines: indented under the label, before the next choice
    const members = [c.l];
    for (let j = c.i + 1; j < ls.length; j++) {
      const l = ls[j];
      if (next && j >= next.i) break;
      if (l.column !== c.l.column) break;
      const last = members[members.length - 1];
      if (l.y - (last.y + last.h) > lineH * 1.1) break;
      if (l.x < labelX + 0.004) break;
      members.push(l);
    }
    const top = c.l.y - lineH * 0.22;
    const bottom = Math.max(...members.map((m) => m.y + m.h)) + lineH * 0.22;
    const right = Math.max(...members.map((m) => m.x + m.w));
    const reg: ChoiceRegion = { letter: c.m!.letter, page, x: labelX - 0.004, y: top, w: right - labelX + 0.012, h: bottom - top };
    // the page's own radio circle (OCR reads it as "O", "©", …): our selection is drawn on top of it
    const first = words && c.l.idx.length > 1 ? words[c.l.idx[0]] : undefined;
    if (first && /^[O0o©®○◯●◉◎@¤]$/.test(first.t) && first.w < lineH * 2.2) {
      const size = Math.max(first.w, first.h * 0.8);
      reg.radio = { x: first.x + first.w / 2 - size / 2, y: first.y + first.h / 2 - size / 2, w: size, h: size };
      reg.x = Math.min(reg.x, first.x - 0.004);
      reg.w = right - reg.x + 0.012;
    }
    choices.push(reg);
    texts.push({ letter: c.m!.letter, text: [c.m!.rest, ...members.slice(1).map((m) => m.text)].join(' ').trim() });
  });
  // regions must not overlap; trim to the midpoint if they do
  for (let k = 0; k + 1 < choices.length; k++) {
    const a = choices[k];
    const b = choices[k + 1];
    if (a.page === b.page && Math.abs(a.x - b.x) < 0.05 && a.y + a.h > b.y) {
      const mid = (a.y + a.h + b.y) / 2;
      a.h = mid - a.y;
      b.h = b.y + b.h - mid;
      b.y = mid;
    }
  }
  const conf = Math.min(...best.map((c) => c.l.conf));
  let confidence = best.length >= 3 ? 0.95 : 0.75;
  if (conf < 0.6) confidence -= 0.25;
  else if (conf < 0.8) confidence -= 0.1;
  if (texts.some((t) => !t.text)) confidence -= 0.2;
  return { choices, texts, confidence: Math.max(0, confidence) };
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] ?? 0.02;
}

// --------------------------------------------------------------------------- layout
export interface DetectedSegment {
  page: number;
  rect: Rect | undefined;
}
export interface DetectedQuestion {
  number: number;
  segments: DetectedSegment[];
  /** "Answer: C" found after the question */
  inlineAnswer?: string;
  inlineExplanation?: string;
}

export interface LayoutResult {
  questions: DetectedQuestion[];
  /** fraction of text pages that got a question start (how sure we are) */
  confidence: number;
  multiPerPage: boolean;
}

interface Start {
  page: number;
  column: number;
  y: number;
  n: number;
  hint: boolean;
}

/**
 * Work out which part of which page belongs to which question, by reading question numbers in sequence.
 * Pages with text but no new question continue the previous question (multi-page questions).
 */
export function detectLayout(pages: PageLines[], opts: { inlineAnswers?: boolean } = {}): LayoutResult {
  const starts: Start[] = [];
  let expected = 1;
  const pageStarts = new Map<number, Start[]>();
  let textPages = 0;
  let sawChoicesSinceStart = false;
  for (const p of pages) {
    if (p.lines.length < 2) continue;
    textPages++;
    const found: Start[] = [];
    const hint = p.lines.map((l) => ITEM_OF_RE.exec(l.text)).find(Boolean);
    const hintN = hint ? parseInt(hint[1], 10) : null;
    const ordered = [...p.lines].sort((a, b) => a.column - b.column || a.y - b.y);
    for (const l of ordered) {
      const n = matchQuestionStart(l.text);
      if (n == null) continue;
      const leftOk = l.x <= (p.colLeft[l.column] ?? 0) + 0.06;
      if (!leftOk) continue;
      // a start must be the next number; allow skipping one unreadable number when an "Item N" header agrees
      if (n === expected || (n === expected + 1 && hintN === n)) {
        found.push({ page: p.page, column: l.column, y: l.y, n, hint: false });
        expected = n + 1;
      }
    }
    const choiceRun = detectChoices(p.lines, p.page).choices.length >= 3;
    if (!found.length) {
      const top = Math.min(...p.lines.map((l) => l.y));
      if (hintN != null && hintN === expected) {
        found.push({ page: p.page, column: 0, y: top, n: hintN, hint: true });
        expected = hintN + 1;
      } else if (choiceRun && sawChoicesSinceStart && starts.length > 0) {
        // a full new set of choices with no readable number: still a new question
        found.push({ page: p.page, column: 0, y: top, n: expected, hint: true });
        expected++;
      }
    }
    if (found.length) {
      sawChoicesSinceStart = choiceRun && found.length === 1;
      starts.push(...found);
      pageStarts.set(p.page, found);
    } else if (choiceRun) sawChoicesSinceStart = true;
  }
  if (starts.length === 0) return { questions: [], confidence: 0, multiPerPage: false };

  const byPage = new Map(pages.map((p) => [p.page, p]));
  const questions: DetectedQuestion[] = [];
  const st: { cur: DetectedQuestion | null } = { cur: null };
  let multi = false;
  const PAD = 0.008;
  for (const p of pages) {
    const ps = (pageStarts.get(p.page) ?? []).sort((a, b) => a.column - b.column || a.y - b.y);
    if (ps.length > 1) multi = true;
    const top = p.content?.y ?? 0;
    const bottom = p.content ? p.content.y + p.content.h : 1;
    const ncols = Math.max(1, p.colLeft.length);
    const colRect = (c: number, y0: number, y1: number): Rect => {
      // whole width when the page has one column, else that column's extent
      if (ncols === 1) {
        const x0 = p.content?.x ?? 0;
        const x1 = p.content ? p.content.x + p.content.w : 1;
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      const l = Math.max(0, p.colLeft[c] - 0.015);
      const r = Math.min(1, (p.colRight[c] ?? 1) + 0.015);
      return { x: l, y: y0, w: r - l, h: y1 - y0 };
    };
    if (!ps.length) {
      if (st.cur && p.lines.length >= 1) st.cur.segments.push({ page: p.page, rect: undefined });
      continue;
    }
    for (let c = 0; c < ncols; c++) {
      const inCol = ncols === 1 ? ps : ps.filter((s) => s.column === c);
      const colTop = Math.min(...p.lines.filter((l) => l.column === c).map((l) => l.y), bottom);
      // part of the column before its first start continues the previous question
      const first = inCol[0];
      if (st.cur && (!first || first.y - colTop > 0.02)) {
        const y1 = first ? first.y - PAD : bottom;
        if (y1 - colTop > 0.01) st.cur.segments.push({ page: p.page, rect: clampRect(colRect(c, Math.max(top, colTop - PAD), y1)) });
      }
      inCol.forEach((s, k) => {
        const next = inCol[k + 1];
        const y0 = Math.max(top, s.y - PAD);
        const y1 = next ? next.y - PAD : bottom;
        st.cur = { number: s.n, segments: [{ page: p.page, rect: clampRect(colRect(c, y0, y1)) }] };
        questions.push(st.cur);
      });
      if (ncols === 1) break;
    }
  }
  // a question that fills its whole page needs no rectangle: the page crop applies
  for (const q of questions) {
    for (const s of q.segments) {
      const p = byPage.get(s.page);
      if (!s.rect || !p) continue;
      const onlyThis = (pageStarts.get(s.page)?.length ?? 0) <= 1 && p.colLeft.length <= 1;
      const startsAtTop = s.rect.y <= (p.content?.y ?? 0) + 0.05 || p.lines.every((l) => l.y >= s.rect!.y - 0.01);
      if (onlyThis && startsAtTop) s.rect = undefined;
    }
  }

  if (opts.inlineAnswers) applyInlineAnswers(questions, byPage);
  const pagesWithStart = pageStarts.size;
  return { questions, confidence: textPages ? pagesWithStart / textPages : 0, multiPerPage: multi };
}

function clampRect(r: Rect): Rect {
  const x = Math.max(0, r.x);
  const y = Math.max(0, r.y);
  return { x, y, w: Math.min(1, r.x + r.w) - x, h: Math.min(1, r.y + r.h) - y };
}

/** Find "Answer: C" in each question, take it as the key, and cut it (and what follows) out of the visible question. */
function applyInlineAnswers(questions: DetectedQuestion[], byPage: Map<number, PageLines>) {
  for (const q of questions) {
    let found = false;
    const expl: string[] = [];
    const keep: DetectedSegment[] = [];
    for (const s of q.segments) {
      const p = byPage.get(s.page);
      if (!p) {
        keep.push(s);
        continue;
      }
      if (found) {
        // whole segment is explanation
        for (const l of linesIn(p, s.rect)) expl.push(l.text);
        continue;
      }
      const ls = linesIn(p, s.rect);
      const idx = ls.findIndex((l) => {
        const m = ANSWER_RE.exec(l.text.trim());
        return !!m && m[1] === m[1].toUpperCase();
      });
      if (idx < 0) {
        keep.push(s);
        continue;
      }
      found = true;
      const m = ANSWER_RE.exec(ls[idx].text.trim())!;
      q.inlineAnswer = m[1].toUpperCase();
      if (m[2]) expl.push(m[2]);
      for (const l of ls.slice(idx + 1)) expl.push(l.text);
      const base = s.rect ?? p.content ?? { x: 0, y: 0, w: 1, h: 1 };
      const cut = ls[idx].y - 0.006;
      if (cut - base.y > 0.02) keep.push({ page: s.page, rect: { ...base, h: cut - base.y } });
    }
    if (found) {
      q.segments = keep.length ? keep : q.segments.slice(0, 1);
      q.inlineExplanation = expl.join('\n').replace(/\n(?=[a-z])/g, ' ').trim();
    }
  }
}

function linesIn(p: PageLines, r: Rect | undefined): Line[] {
  return p.lines.filter((l) => !r || inside(l, r, 0.02)).sort((a, b) => a.column - b.column || a.y - b.y);
}

/** Lines of a page that fall inside a question's visible area. */
export function linesForSegment(p: PageLines, r: Rect | undefined): Line[] {
  return linesIn(p, r);
}
