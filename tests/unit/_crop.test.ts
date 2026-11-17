// LOCAL debugging only (skipped unless CROPFILE is set): run the page trim on one page of a PDF.
import fs from 'node:fs';
import { it } from 'vitest';
import { detectCrop } from '../../src/lib/crop';
it.skipIf(!process.env.CROPFILE)('crop', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.env.CROPFILE!)), verbosity: 0 }).promise;
  const pg = await doc.getPage(Number(process.env.CROPPAGE));
  const vp0 = pg.getViewport({ scale: 1 });
  const vp = pg.getViewport({ scale: Number(process.env.CROPW ?? 600) / vp0.width });
  const c = createCanvas(Math.round(vp.width), Math.round(vp.height));
  await pg.render({ canvasContext: c.getContext('2d') as never, viewport: vp, canvas: c as never }).promise;
  const img = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  fs.writeFileSync(process.env.CROPOUT ?? '/dev/stderr', JSON.stringify(detectCrop({ data: img.data as unknown as Uint8ClampedArray, width: img.width, height: img.height })) + '\n');
});
