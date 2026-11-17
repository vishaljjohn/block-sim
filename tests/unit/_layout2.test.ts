// LOCAL only (skipped unless LAYOUTDUMP2 is set): shading scores for the repeated choice rows.
import fs from 'node:fs';
import { it } from 'vitest';
import { detectLayout, pageLines } from '../../src/lib/detect';
it.skipIf(!process.env.LAYOUTDUMP2)('shade rows', async () => {
  const d = JSON.parse(fs.readFileSync(process.env.LAYOUTDUMP2!, 'utf8')).sort((a: any, b: any) => a.page - b.page);
  const lay = detectLayout(d.map((p: any) => pageLines(p.page, p.words, p.autoCrop)), { inlineAnswers: true });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.env.PDF2!)), verbosity: 0 }).promise;
  const out: string[] = [];
  for (const q of lay.questions) {
    if (!q.answerList) { out.push(`${q.number}: no list`); continue; }
    const pg = await doc.getPage(q.answerList.page);
    const vp = pg.getViewport({ scale: 900 / pg.getViewport({ scale: 1 }).width });
    const c = createCanvas(Math.round(vp.width), Math.round(vp.height));
    await pg.render({ canvasContext: c.getContext('2d') as never, viewport: vp, canvas: c as never }).promise;
    const { data, width: W, height: H } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const hs = q.answerList.choices.map((x) => x.h).sort((a, b) => a - b);
    const lineH = hs[Math.floor(hs.length / 2)];
    const sc = q.answerList.choices.map((ch) => {
      let n = 0, g = 0;
      for (let y = Math.floor(ch.y * H); y <= Math.ceil((ch.y + Math.min(ch.h, lineH * 1.1)) * H); y++) for (let x = Math.floor(ch.x * W); x <= Math.ceil((ch.x + ch.w) * W); x++) {
        const i = (y * W + x) * 4; const r = data[i], gg = data[i + 1], b = data[i + 2]; const L = r * 0.299 + gg * 0.587 + b * 0.114; n++;
        if (Math.max(r, gg, b) - Math.min(r, gg, b) < 24 && L >= 105 && L <= 222) g++;
      }
      return `${ch.letter}${(g / n).toFixed(2)}@${ch.y.toFixed(3)}`;
    });
    out.push(`${q.number}: p${q.answerList.page} x${q.answerList.choices[0].x.toFixed(2)} w${q.answerList.choices[0].w.toFixed(2)} ${sc.join(' ')}`);
  }
  fs.writeFileSync(process.env.LAYOUTOUT!, out.join('\n'));
});
