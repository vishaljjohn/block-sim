import fs from 'node:fs';
import { it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { LAB_TABS } from '../../src/data/labValues';
const F = 'NBME_Laboratory_Reference_Values.pdf';
it.skipIf(!fs.existsSync(F))('lab values match the reference PDF', async () => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(F)), verbosity: 0 }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) text += (await (await doc.getPage(p)).getTextContent()).items.map((i: any) => i.str).join('');
  const norm = (s: string) => s.replace(/[\s₀-₉⁰-⁹⁺⁻]/g, '').replace(/[–-]/g, '-').toLowerCase();
  const T = norm(text);
  const bad: string[] = [];
  for (const t of LAB_TABS) for (const r of t.rows) {
    if (r.kind !== 'row') continue;
    for (const v of [r.ref, r.si]) {
      if (!v) continue;
      // compare the numbers and units, ignoring sub/superscripts that the PDF draws separately
      if (!T.includes(norm(v))) bad.push(`${t.id}: ${r.name || '(cont.)'} → "${v}"`);
    }
  }
  console.log('NOT FOUND IN PDF:\n' + bad.join('\n'));
});
