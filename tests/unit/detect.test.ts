import { describe, expect, it } from 'vitest';
import { detectChoices, detectLayout, matchChoiceLabel, matchQuestionStart, pageLines } from '../../src/lib/detect';
import { detectCrop } from '../../src/lib/crop';
import { buildLines } from '../../src/lib/textLines';
import type { Word } from '../../src/types';
import { pdfPages } from './fixtures.test';
import fs from 'node:fs';
import path from 'node:path';

const answers = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/generated/answers.json'), 'utf8'));

/** Lay text out as words on a page: each entry is [x, y, text]. */
function words(lines: [number, number, string][]): Word[] {
  const out: Word[] = [];
  for (const [x0, y, text] of lines) {
    let x = x0;
    for (const t of text.split(' ')) {
      out.push({ t, x, y, w: t.length * 0.008, h: 0.02, c: 95 });
      x += t.length * 0.008 + 0.006;
    }
  }
  return out;
}

describe('labels', () => {
  it('choice labels in every style, with OCR radio glyphs', () => {
    expect(matchChoiceLabel('A) Chronic migraines')).toEqual({ letter: 'A', rest: 'Chronic migraines' });
    expect(matchChoiceLabel('B. Early cataracts')?.letter).toBe('B');
    expect(matchChoiceLabel('(C) Something')?.letter).toBe('C');
    expect(matchChoiceLabel('d. lower case')?.letter).toBe('D');
    expect(matchChoiceLabel('O E) Sexual activity')?.letter).toBe('E');
    expect(matchChoiceLabel('© F) Other')?.letter).toBe('F');
    expect(matchChoiceLabel('A 19-year-old woman')).toBeNull();
    expect(matchChoiceLabel('At the clinic')).toBeNull();
  });
  it('question starts', () => {
    expect(matchQuestionStart('1. A 19-year-old')).toBe(1);
    expect(matchQuestionStart('12) Which of')).toBe(12);
    expect(matchQuestionStart('Q7 A man')).toBe(7);
    expect(matchQuestionStart('Question 3')).toBe(3);
    expect(matchQuestionStart('2.5 mg daily')).toBeNull();
  });
});

describe('choice detection', () => {
  it('finds A–E below the stem with multi-line choices and gives each a region', () => {
    const w = words([
      [0.05, 0.1, '1. A 40-year-old man has a cough. Which is'],
      [0.05, 0.13, 'the best next step? A. B. C. are mentioned here'],
      [0.07, 0.2, 'A) Alpha choice'],
      [0.07, 0.23, 'B) Bravo choice that is long and'],
      [0.1, 0.26, 'wraps to a second line'],
      [0.07, 0.29, 'C) Charlie'],
      [0.07, 0.32, 'D) Delta'],
      [0.07, 0.35, 'E) Echo'],
    ]);
    const d = detectChoices(buildLines(w), 1);
    expect(d.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(d.confidence).toBeGreaterThan(0.8);
    const b = d.choices[1];
    expect(b.y + b.h).toBeGreaterThan(0.27); // includes the wrapped line
    expect(b.y + b.h).toBeLessThanOrEqual(d.choices[2].y + 1e-9); // no overlap
    expect(d.texts[1].text).toBe('Bravo choice that is long and wraps to a second line');
  });
  it('rejects runs that do not start at A or are out of order', () => {
    const w = words([
      [0.07, 0.2, 'B) one'],
      [0.07, 0.23, 'C) two'],
    ]);
    expect(detectChoices(buildLines(w), 1).choices).toEqual([]);
  });
});

describe('layout on the generated text PDFs', () => {
  it('c) several questions per page are split into one region each', async () => {
    const pages = (await pdfPages('c-multi-per-page.pdf')).slice(0, -1);
    const lay = detectLayout(pages.map((p) => pageLines(p.page, p.words)));
    expect(lay.questions.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(lay.multiPerPage).toBe(true);
    for (const q of lay.questions) {
      expect(q.segments.length).toBe(1);
      expect(q.segments[0].rect).toBeDefined();
    }
    // regions on one page are stacked and do not overlap
    const p1 = lay.questions.slice(0, 3).map((q) => q.segments[0].rect!);
    expect(p1[0].y + p1[0].h).toBeLessThanOrEqual(p1[1].y + 1e-6);
    // each region has its own lowercase choices a–d
    const pl = pageLines(1, pages[0].words);
    for (const q of lay.questions.slice(0, 3)) {
      const r = q.segments[0].rect!;
      const d = detectChoices(pl.lines.filter((l) => l.y >= r.y && l.y <= r.y + r.h), 1, r);
      expect(d.choices.map((c) => c.letter)).toEqual(['A', 'B', 'C', 'D']);
    }
  });
  it('d) two columns with choices up to H', async () => {
    const pages = await pdfPages('d-two-column.pdf');
    const lay = detectLayout(pages.map((p) => pageLines(p.page, p.words)));
    expect(lay.questions.map((q) => q.number)).toEqual([1, 2, 3, 4]);
    const pl = pageLines(1, pages[0].words);
    expect(pl.colLeft.length).toBe(2);
    const r = lay.questions[1].segments[0].rect!;
    expect(r.x).toBeGreaterThan(0.45);
    const d = detectChoices(pl.lines, 1, r);
    expect(d.choices.map((c) => c.letter).join('')).toBe('ABCDEFGH');
  });
  it('b) inline "Answer: C" is read as the key and cut out of the visible question', async () => {
    const pages = await pdfPages('b-answer-after.pdf');
    const pls = pages.map((p) => pageLines(p.page, p.words));
    const lay = detectLayout(pls, { inlineAnswers: true });
    expect(lay.questions.map((q) => q.inlineAnswer)).toEqual(answers.b);
    for (const q of lay.questions) {
      const r = q.segments[0].rect!;
      const pl = pls.find((p) => p.page === q.segments[0].page)!;
      const ans = pl.lines.find((l) => /^Answer:/.test(l.text))!;
      expect(r.y + r.h).toBeLessThan(ans.y);
      expect(q.inlineExplanation).toMatch(/preferred in this made-up scenario/);
    }
  });
  it('a page with no new number continues the previous question (2 pages per question)', () => {
    const p = (n: number, lines: [number, number, string][]) => pageLines(n, words(lines));
    const lay = detectLayout([
      p(1, [[0.05, 0.1, '1. A long stem that'], [0.05, 0.13, 'continues on the next page and more text']]),
      p(2, [[0.05, 0.1, 'still the first question'], [0.07, 0.2, 'A) one'], [0.07, 0.23, 'B) two'], [0.07, 0.26, 'C) three']]),
      p(3, [[0.05, 0.1, '2. Second question here'], [0.07, 0.2, 'A) one'], [0.07, 0.23, 'B) two'], [0.07, 0.26, 'C) three']]),
      p(4, [[0.05, 0.1, 'Item 3 of 3 header'], [0.05, 0.15, 'Third stem without a number'], [0.07, 0.2, 'A) one'], [0.07, 0.23, 'B) two']]),
    ]);
    expect(lay.questions.map((q) => q.segments.map((s) => s.page))).toEqual([[1, 2], [3], [4]]);
  });
});

describe('auto-crop', () => {
  /** A fake screenshot: browser bar, navy app header, white content with text, dark dock. */
  function screenshot() {
    const W = 200;
    const H = 150;
    const data = new Uint8ClampedArray(W * H * 4);
    const fill = (x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number]) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...rgb, 255], (y * W + x) * 4);
    };
    fill(0, 0, W, H, [255, 255, 255]);
    fill(0, 0, W, 12, [200, 200, 200]); // browser chrome (light gray but…)
    fill(10, 3, 150, 9, [90, 90, 90]); // …with an address bar
    fill(0, 12, W, 24, [28, 73, 115]); // navy header
    // text lines: dense but mixed ink, like real glyphs
    const text = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if ((x + y) % 3 === 0) data.set([0, 0, 0, 255], (y * W + x) * 4);
    };
    text(20, 40, 170, 44);
    text(20, 50, 160, 54);
    text(25, 70, 90, 73); // choices
    text(25, 80, 80, 83);
    fill(120, 60, 170, 95, [140, 70, 60]); // a photo exhibit (dense color) must stay inside the crop
    fill(0, 130, W, H, [30, 30, 30]); // dock
    return { data, width: W, height: H };
  }
  it('drops toolbars, headers and docks and trims to the question', () => {
    const r = detectCrop(screenshot());
    expect(r.y).toBeGreaterThan(24 / 150 - 0.001);
    expect(r.y + r.h).toBeLessThan(130 / 150);
    expect(r.y).toBeLessThan(40 / 150);
    expect(r.y + r.h).toBeGreaterThan(83 / 150);
    expect(r.x).toBeLessThan(20 / 200);
    expect(r.x + r.w).toBeGreaterThan(170 / 200);
    expect(r.y + r.h).toBeGreaterThan(95 / 150);
  });
  it('a plain page with text everywhere keeps the full page', () => {
    const W = 50;
    const H = 50;
    const data = new Uint8ClampedArray(W * H * 4).fill(255);
    for (const [x, y] of [[0, 0], [49, 49]]) data.set([0, 0, 0, 255], (y * W + x) * 4);
    expect(detectCrop({ data, width: W, height: H })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe('answer marked by a highlight', () => {
  it('picks the choice with yellow behind it', async () => {
    const { highlightedChoice } = await import('../../src/lib/crop');
    const W = 100;
    const H = 100;
    const data = new Uint8ClampedArray(W * H * 4).fill(255);
    for (let y = 40; y < 48; y++) for (let x = 10; x < 60; x++) data.set([255, 240, 40, 255], (y * W + x) * 4);
    const ch = ['A', 'B', 'C'].map((letter, i) => ({ letter, x: 0.1, y: 0.3 + i * 0.1, w: 0.5, h: 0.08 }));
    expect(highlightedChoice({ data, width: W, height: H }, ch)).toBe('B');
    expect(highlightedChoice({ data: new Uint8ClampedArray(W * H * 4).fill(255), width: W, height: H }, ch)).toBeNull();
  });
  it('keeps only the explanation after the repeated stem and choices', async () => {
    const { explanationAfterChoices } = await import('../../src/lib/keyParser');
    expect(explanationAfterChoices(['1. A man has a cough.', 'A) One', 'B) Two', 'This is why.', '', 'More.'])).toBe('This is why.\n\nMore.');
  });
});

describe('numbering search', () => {
  const p = (n: number, lines: [number, number, string][]) => pageLines(n, words(lines));
  const ch = (y: number): [number, number, string][] => [[0.07, y, 'A) one'], [0.07, y + 0.03, 'B) two'], [0.07, y + 0.06, 'C) three']];
  it('unnumbered one-question-per-page screenshots: each new set of choices is a new question, and a stray "1." later does not restart the count', () => {
    const pages = [1, 2, 3, 4].map((n) => p(n, [[0.05, 0.1, 'A woman has a problem and more words here'], ...ch(0.2)]));
    pages.push(p(5, [[0.05, 0.1, '1. Lab list item that is not a question'], ...ch(0.2)]));
    const lay = detectLayout(pages);
    expect(lay.questions.map((q) => q.segments.map((s) => s.page).join('+'))).toEqual(['1', '2', '3', '4', '5']);
  });
  it('numbered questions with choices on the second page stay two-page questions', () => {
    const pages = [p(1, [[0.05, 0.1, '1. Stem text continues on and on']]), p(2, ch(0.1)), p(3, [[0.05, 0.1, '2. Second stem text goes here']]), p(4, ch(0.1))];
    const lay = detectLayout(pages);
    expect(lay.questions.map((q) => q.segments.map((s) => s.page).join('+'))).toEqual(['1+2', '3+4']);
  });
});

describe('choices in two side-by-side columns', () => {
  it('splits "O A) … O G) …" lines into two columns, A–F then G–L', () => {
    const rows: [number, number, string][] = [];
    'ABCDEF'.split('').forEach((l, i) => rows.push([0.04, 0.2 + i * 0.03, `O ${l}) Left choice ${l}          O ${String.fromCharCode(l.charCodeAt(0) + 6)}) Right choice`]));
    const w = words(rows).map((x) => x);
    // put the right half far to the right
    for (const x of w) if (x.x > 0.2) x.x += 0.3;
    const d = detectChoices(buildLines(w), 1, null, w);
    expect(d.choices.map((c) => c.letter).join('')).toBe('ABCDEFGHIJKL');
    expect(d.choices[6].x).toBeGreaterThan(d.choices[0].x + 0.2);
    expect(d.choices[0].x + d.choices[0].w).toBeLessThan(d.choices[6].x);
  });
});

describe('pictures in a question', () => {
  it('finds a photo next to text and ignores the text itself', async () => {
    const { detectFigures } = await import('../../src/lib/figures');
    const W = 240;
    const H = 180;
    const data = new Uint8ClampedArray(W * H * 4).fill(255);
    // text-like ink on the left, covered by word boxes
    for (let y = 20; y < 26; y++) for (let x = 10; x < 110; x++) if (x % 2) data.set([0, 0, 0, 255], (y * W + x) * 4);
    const ws: Word[] = [{ t: 'text', x: 10 / W, y: 20 / H, w: 100 / W, h: 6 / H, c: 99 }];
    // a photo on the right
    for (let y = 30; y < 110; y++) for (let x = 140; x < 220; x++) data.set([200 - (x % 40), 150, 120 + (y % 30), 255], (y * W + x) * 4);
    const f = detectFigures({ data, width: W, height: H }, ws);
    expect(f.length).toBe(1);
    expect(f[0].x).toBeGreaterThan(130 / W);
    expect(f[0].x + f[0].w).toBeLessThan(230 / W);
    expect(f[0].h).toBeGreaterThan(70 / H);
    expect(detectFigures({ data: new Uint8ClampedArray(W * H * 4).fill(255), width: W, height: H }, [])).toEqual([]);
  });
});
