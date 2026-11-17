import fs from 'node:fs';
import { it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { itemsToWords } from '../../src/lib/pdfWords';
import { pageLines, detectChoices, matchChoiceLabel } from '../../src/lib/detect';
it.skipIf(!process.env.F)('lines', async () => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.env.F!)), verbosity: 0 }).promise;
  for (const pn of process.env.P!.split(',').map(Number)) {
    const page = await doc.getPage(pn);
    const tc = await page.getTextContent();
    const w = itemsToWords(tc.items, page.getViewport({ scale: 1 }), pdfjs.Util.transform as never);
    const pl = pageLines(pn, w);
    const d = detectChoices(pl.lines, pn, null, w);
    console.log('PAGE', pn, 'cols', pl.colLeft.length, 'choices', d.choices.map((c) => c.letter).join(''), d.confidence);
    for (const l of pl.lines) console.log(`  c${l.column} x${l.x.toFixed(3)} y${l.y.toFixed(3)} ${matchChoiceLabel(l.text) ? '*' : ' '} ${l.text.slice(0, 60)}`);
  }
});
