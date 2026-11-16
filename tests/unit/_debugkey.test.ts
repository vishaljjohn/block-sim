import fs from 'node:fs';
import { it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { itemsToWords } from '../../src/lib/pdfWords';
import { pagesToKeyLines } from '../../src/lib/textLines';
import { parseKeyLines } from '../../src/lib/keyParser';

it.skipIf(!process.env.KEYFILE)('debug key', async () => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.env.KEYFILE!)), verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push({ page: p, words: itemsToWords(tc.items, page.getViewport({ scale: 1 }), pdfjs.Util.transform as never) });
  }
  const lines = pagesToKeyLines(pages);
  const k = parseKeyLines(lines);
  const got = new Set(k.entries.filter((e) => e.answer).map((e) => e.n));
  console.log('found', got.size, 'missing', Array.from({ length: 50 }, (_, i) => i + 1).filter((n) => !got.has(n)).join(','));
  if (process.env.ENTRIES) for (const e of k.entries.filter((e) => process.env.ENTRIES!.split(',').includes(String(e.n)))) console.log('ENTRY', e.n, 'p', e.page, 'ans', e.answer, '|', (e.raw?.[0] ?? e.explanation).slice(0, 60));
  if (process.env.AROUND) {
    for (const n of process.env.AROUND.split(',').map(Number)) {
      const i = lines.findIndex((l) => new RegExp(`(^|\\D)${n}\\s*[.):]|Item ${n} of`).test(l.text));
      console.log('--', n, 'at line', i);
      if (i >= 0) for (const l of lines.slice(Math.max(0, i - 2), i + 14)) if (l.text.trim()) console.log('   ', l.page, l.text.slice(0, 70));
      const ans = lines.filter((l) => /nswer/i.test(l.text) && l.page === lines[i]?.page);
      for (const l of ans) console.log('    ANS', l.page, l.text.slice(0, 50));
    }
  }
  if (process.env.SHOWLINES) for (const l of lines.filter((l) => l.page && Number(process.env.SHOWLINES!.split(',').includes(String(l.page))))) console.log(l.page, l.top ? 'T' : ' ', l.text.slice(0, 90));
});
