// LOCAL debugging only (skipped unless PDFLINES is set): the app's own lines and flags for some pages of a PDF.
import fs from 'node:fs';
import { it } from 'vitest';
import { itemsToWords } from '../../src/lib/pdfWords';
import { pageLines, matchChoiceLabel, matchQuestionStart } from '../../src/lib/detect';
it.skipIf(!process.env.PDFLINES)('lines', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.env.PDFLINES!)), verbosity: 0 }).promise;
  const out: string[] = [];
  for (const n of (process.env.PAGES ?? '1,2,3').split(',').map(Number)) {
    const pg = await doc.getPage(n);
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    const words = itemsToWords(tc.items, vp, pdfjs.Util.transform as never);
    const pl = pageLines(n, words);
    out.push(`PAGE ${n} words ${words.length} cols ${pl.colLeft.length}`);
    for (const l of pl.lines) out.push(`  c${l.column} x${l.x.toFixed(3)} y${l.y.toFixed(3)} ${matchQuestionStart(l.text) != null ? 'Q' + matchQuestionStart(l.text) : '  '} ${matchChoiceLabel(l.text)?.letter ?? ' '} | ${l.text.slice(0, 60)}`);
  }
  fs.writeFileSync(process.env.LINESOUT!, out.join('\n'));
});
