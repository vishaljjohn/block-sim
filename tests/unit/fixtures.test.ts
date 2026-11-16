import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { itemsToWords, hasRealText } from '../../src/lib/pdfWords';
import { pagesToKeyLines } from '../../src/lib/textLines';
import { parseKeyLines } from '../../src/lib/keyParser';
import type { Word } from '../../src/types';

const dir = path.resolve(__dirname, '../fixtures/generated');
let answers: Record<string, string[]>;

export async function pdfPages(file: string): Promise<{ page: number; words: Word[] }[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(dir, file))), verbosity: 0 }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    out.push({ page: p, words: itemsToWords(tc.items, vp, pdfjs.Util.transform as never) });
  }
  return out;
}

beforeAll(() => {
  if (!fs.existsSync(path.join(dir, 'answers.json'))) throw new Error('Run `npm run fixtures` first.');
  answers = JSON.parse(fs.readFileSync(path.join(dir, 'answers.json'), 'utf8'));
});

describe('generated fixture PDFs', () => {
  it('a) separate key PDF "1. C. explanation" with numbers and page breaks', async () => {
    const pages = await pdfPages('a-key.pdf');
    expect(pages.length).toBeGreaterThan(1);
    const k = parseKeyLines(pagesToKeyLines(pages));
    expect(k.entries.map((e) => e.answer)).toEqual(answers.a);
    for (const e of k.entries) {
      expect(e.explanation).toMatch(/Numbers like this at the start of a line/);
      expect(e.explanation).toMatch(/Further detail line 8/);
    }
  });
  it('a) question PDF is image-only', async () => {
    const pages = await pdfPages('a-image-questions.pdf');
    expect(pages.every((p) => !hasRealText(p.words))).toBe(true);
  });
  it('b) "Answer: C" after each question', async () => {
    const k = parseKeyLines(pagesToKeyLines(await pdfPages('b-answer-after.pdf')));
    expect(k.entries.map((e) => e.answer)).toEqual(answers.b);
    expect(k.entries[0].explanation).not.toMatch(/year-old/);
  });
  it('c) key table at the end', async () => {
    const pages = await pdfPages('c-multi-per-page.pdf');
    const k = parseKeyLines(pagesToKeyLines(pages.slice(-1)));
    expect(k.entries.map((e) => e.answer)).toEqual(answers.c);
  });
});
