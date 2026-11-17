// LOCAL only (skipped unless SCRAMBLEDIR is set): how many pages of each PDF the scrambled-text check flags.
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { isScrambled, itemsToWords } from '../../src/lib/pdfWords';
it.skipIf(!process.env.SCRAMBLEDIR)('scan', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const files: string[] = [];
  const walk = (d: string) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.pdf$/i.test(n)) files.push(p); } };
  walk(process.env.SCRAMBLEDIR!);
  const out: string[] = [];
  for (const f of files) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(f)), verbosity: 0 }).promise;
    let flagged = 0, withText = 0;
    const n = Math.min(doc.numPages, Number(process.env.MAXP ?? 60));
    for (let i = 1; i <= n; i++) {
      const pg = await doc.getPage(i);
      const ws = itemsToWords((await pg.getTextContent()).items, pg.getViewport({ scale: 1 }), pdfjs.Util.transform as never);
      if (ws.length >= 6) withText++;
      if (isScrambled(ws)) flagged++;
    }
    out.push(`${flagged}/${withText}/${n} ${path.relative(process.env.SCRAMBLEDIR!, f).replace(/[^/]*$/, (m) => m.length > 12 ? m.slice(0, 12) + '…' : m)}`);
    await doc.cleanup?.();
  }
  fs.writeFileSync(process.env.SCRAMBLEOUT!, out.join('\n'));
}, 1_800_000);
