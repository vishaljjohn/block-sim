import fs from 'node:fs';
import { it } from 'vitest';
import { createRequire } from 'node:module';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { itemsToWords } from '../../src/lib/pdfWords';
import { pageLines, detectChoices } from '../../src/lib/detect';
import { highlightedChoice } from '../../src/lib/crop';
const require = createRequire(import.meta.url);
it.skipIf(!process.env.HLFILE)('hl', async () => {
  const { createCanvas } = require('@napi-rs/canvas');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.env.HLFILE!)), verbosity: 0 }).promise;
  const out: string[] = [];
  for (let p = 2; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const w = itemsToWords(tc.items, page.getViewport({ scale: 1 }), pdfjs.Util.transform as never);
    const d = detectChoices(pageLines(p, w).lines, p, null, w);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 900 / v1.width });
    const c = createCanvas(Math.round(vp.width), Math.round(vp.height));
    const ctx = c.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp, canvas: c } as never).promise;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    let h: string | null = null;
    if (d.choices.length >= 2) {
      const tops = d.choices.map((x) => x.y);
      const step = (tops[tops.length - 1] - tops[0]) / (tops.length - 1);
      const last = d.choices[d.choices.length - 1];
      const extra = { letter: String.fromCharCode(last.letter.charCodeAt(0) + 1), x: last.x, y: last.y + step, w: Math.max(...d.choices.map((x) => x.w)), h: Math.min(last.h, step) };
      h = highlightedChoice({ data: img.data, width: c.width, height: c.height }, [...d.choices, extra]);
    }
    out.push(`${p}:${d.choices.map((x) => x.letter).join('')}:${h ?? '-'}`);
  }
  console.log(out.join(' '));
});
