import { describe, expect, it } from 'vitest';
import { choiceWords, rectsForRange, wordAt, wordsBetween } from '../../src/lib/highlights';
import { detectCrop } from '../../src/lib/crop';
import type { Word } from '../../src/types';

const w = (t: string, x: number, y: number, ww = 0.06, h = 0.015): Word => ({ t, x, y, w: ww, h, c: 95 });

describe('highlights follow the text', () => {
  // recognition listed the second line before the first
  const words = [w('third', 0.1, 0.13), w('fourth', 0.18, 0.13), w('first', 0.1, 0.1), w('second', 0.18, 0.1)];
  it('a range runs in reading order, not in recognition order', () => {
    expect(wordsBetween(words, 2, 1)).toEqual([2, 3, 0, 1]);
    const r = rectsForRange(words, 3, 0);
    expect(r).toHaveLength(2);
    expect(r[0].y).toBeLessThan(r[1].y);
  });
  it('a word box far taller than the text (a picture read as a word) is never painted or picked', () => {
    const junk = [...words, w('x', 0.3, 0.2, 0.4, 0.3)];
    const r = rectsForRange(junk, 2, 4);
    expect(r.every((b) => b.h < 0.03)).toBe(true);
    expect(wordAt(junk, 0.5, 0.35)).toBe(-1);
  });
  it('rectangles never grow taller than a text line', () => {
    const tall = [w('a', 0.1, 0.1), w('b', 0.18, 0.1), w('c', 0.26, 0.1, 0.06, 0.03)];
    expect(Math.max(...rectsForRange(tall, 0, 2).map((r) => r.h))).toBeLessThan(0.03);
  });
  it('choices in two columns (A–E left, F–J right) are all protected', () => {
    const page = [w('Pick', 0.1, 0.1), w('one', 0.2, 0.1), w('of', 0.3, 0.1), w('these', 0.4, 0.1), w('now', 0.5, 0.1), w('please', 0.6, 0.1),
      w('A)', 0.1, 0.2, 0.02), w('One', 0.13, 0.2), w('B)', 0.1, 0.23, 0.02), w('Two', 0.13, 0.23), w('F)', 0.6, 0.2, 0.02), w('Six', 0.63, 0.2), w('G)', 0.6, 0.23, 0.02), w('Seven', 0.63, 0.23)];
    const got = choiceWords(page, null);
    for (const i of [6, 7, 8, 9]) expect(got.has(i)).toBe(true);
    for (const i of [0, 5]) expect(got.has(i)).toBe(false);
  });
  it('answer choices are found from the text even without clickable choices', () => {
    const page = [w('Which', 0.1, 0.1), w('is', 0.2, 0.1), w('right?', 0.25, 0.1), w('A)', 0.1, 0.15, 0.02), w('One', 0.13, 0.15), w('B)', 0.1, 0.18, 0.02), w('Two', 0.13, 0.18)];
    expect([...choiceWords(page, null)].sort()).toEqual([3, 4, 5, 6]);
  });
});

describe('page trim keeps dark pictures', () => {
  it('a mostly black scan on a white page is content, not a toolbar', () => {
    const W = 200;
    const H = 300;
    const data = new Uint8ClampedArray(W * H * 4).fill(255);
    const fill = (x0: number, y0: number, x1: number, y1: number, v: number[]) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...v, 255], (y * W + x) * 4);
    };
    fill(0, 0, W, 15, [20, 50, 110]); // navy toolbar
    fill(0, H - 15, W, H, [20, 50, 110]);
    fill(20, 40, 95, 140, [10, 10, 10]); // two dark scans side by side
    fill(105, 40, 180, 140, [10, 10, 10]);
    for (let y = 160; y < 260; y += 10) fill(20, y, 170, y + 4, [30, 30, 30]); // lines of text
    const r = detectCrop({ data, width: W, height: H });
    expect(r.y).toBeLessThan(40 / H);
    expect(r.y + r.h).toBeGreaterThan(255 / H);
    expect(r.y).toBeGreaterThan(10 / H); // the toolbar is still trimmed
  });

  it('a picture as wide as the page is kept too', () => {
    const W = 200;
    const H = 300;
    const data = new Uint8ClampedArray(W * H * 4).fill(255);
    const fill = (x0: number, y0: number, x1: number, y1: number, v: number[]) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...v, 255], (y * W + x) * 4);
    };
    fill(0, 0, W, 15, [20, 50, 110]);
    fill(0, 30, W, 120, [15, 15, 15]); // full-width dark x-ray
    for (let y = 140; y < 270; y += 10) fill(20, y, 170, y + 4, [30, 30, 30]);
    const r = detectCrop({ data, width: W, height: H });
    expect(r.y).toBeLessThan(31 / H);
  });

  it('a picture beside the text is kept, not taken for a side bar', () => {
    const W = 300;
    const H = 200;
    const data = new Uint8ClampedArray(W * H * 4).fill(255);
    const fill = (x0: number, y0: number, x1: number, y1: number, v: number[]) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...v, 255], (y * W + x) * 4);
    };
    fill(0, 0, W, 12, [20, 50, 110]);
    for (let y = 30; y < 120; y += 9) fill(15, y, 170, y + 4, [30, 30, 30]); // text on the left
    fill(190, 25, 285, 185, [40, 40, 40]); // a tall picture on the right
    const r = detectCrop({ data, width: W, height: H });
    expect(r.x + r.w).toBeGreaterThan(284 / W);
    expect(r.y + r.h).toBeGreaterThan(184 / H);
  });
});

import { hasRealText, isScrambled } from '../../src/lib/pdfWords';
describe('scrambled text layers', () => {
  const words = (text: string) => text.split(' ').map((t, i) => ({ t, x: i * 0.05, y: 0.1, w: 0.04, h: 0.015, c: 100 }));
  it('text stored with a scrambled character code is not used (the page is read with OCR)', () => {
    const bad = words('2BCM J;NC?HN B;M QAFF >?G;L=;N?> >?JCAG?HN?> G;=OF?M =IHMCMN?HN QCNB PCNCFCAI 5BC=B I@ NB? @IFFIQCHA');
    expect(isScrambled(bad)).toBe(true);
    expect(hasRealText(bad)).toBe(false);
  });
  it('ordinary text, with numbers and units, is kept', () => {
    const good = words('This patient has well-demarcated depigmented macules (eg, 38.4 C) consistent with vitiligo; pulse is 90/min, BP 126/77 mm Hg.');
    expect(isScrambled(good)).toBe(false);
    expect(hasRealText(good)).toBe(true);
  });
});

import { markTableLabels } from '../../src/lib/textLines';
describe('choices in a table', () => {
  const L = (text: string, y: number, x = 0.1) => ({ text, idx: [], x, y, w: 0.3, h: 0.015, column: 0, conf: 1 });
  it('a lettered run (A, B, C…) at one left edge becomes choices; a sentence starting with "A" does not', () => {
    const lines = [L('A 65-year-old man comes to the office', 0.1, 0.08), L('A Age-related change', 0.3), L('B Destruction of cells', 0.33), L('C Inherited absence', 0.36), L('D Infection', 0.39)];
    markTableLabels(lines);
    expect(lines[0].text).toBe('A 65-year-old man comes to the office');
    expect(lines.slice(1).map((l) => l.text.slice(0, 3))).toEqual(['A) ', 'B) ', 'C) ', 'D) ']);
  });
  it('the rest of a list carried onto the next page (E, F) is recognised too', () => {
    const lines = [L('E Post-inflammatory change', 0.08), L('F Superficial infection', 0.12)];
    markTableLabels(lines);
    expect(lines.map((l) => l.text.slice(0, 3))).toEqual(['E) ', 'F) ']);
  });
  it('a lone capitalised sentence is left alone', () => {
    const lines = [L('A woman has a rash', 0.1), L('She also has a fever', 0.13)];
    markTableLabels(lines);
    expect(lines[0].text).toBe('A woman has a rash');
  });
});
