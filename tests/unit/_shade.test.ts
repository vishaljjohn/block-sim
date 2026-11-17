// LOCAL only (skipped unless SHADEFILE is set): shading score per row on one page.
import fs from 'node:fs';
import { it } from 'vitest';
it.skipIf(!process.env.SHADEFILE)('shade', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.env.SHADEFILE!)), verbosity: 0 }).promise;
  const pg = await doc.getPage(Number(process.env.SHADEPAGE));
  const vp = pg.getViewport({ scale: 900 / pg.getViewport({ scale: 1 }).width });
  const c = createCanvas(Math.round(vp.width), Math.round(vp.height));
  await pg.render({ canvasContext: c.getContext('2d') as never, viewport: vp, canvas: c as never }).promise;
  const { data, width: W, height: H } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const out: string[] = [];
  for (let k = 0; k < 6; k++) {
    const y0 = Math.floor((0.071 + k * 0.04025) * H), y1 = Math.floor((0.071 + k * 0.04025 + 0.038 * 1.1) * H);
    const x0 = Math.floor(0.022 * W), x1 = Math.floor(0.62 * W);
    let n = 0, gray = 0, white = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4; const r = data[i], g = data[i + 1], b = data[i + 2]; const L = r * 0.299 + g * 0.587 + b * 0.114;
      n++; if (Math.max(r, g, b) - Math.min(r, g, b) < 24 && L >= 105 && L <= 222) gray++; if (L > 240) white++;
    }
    out.push(`${String.fromCharCode(65 + k)} gray ${(gray / n).toFixed(3)} white ${(white / n).toFixed(3)}`);
  }
  fs.writeFileSync(process.env.SHADEOUT!, out.join('\n'));
});
