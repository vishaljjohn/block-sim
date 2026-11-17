import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoQuestions } from './demo-content.mjs';

export function wrap(font, text, size, maxWidth) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(t, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** One question per page, real text, letter-size landscape-ish page. */
export async function buildDemoPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle('Test Simulator demo exam (original sample questions)');
  demoQuestions.forEach((q, i) => {
    const page = doc.addPage([792, 612]);
    let y = 560;
    const size = 13;
    const lines = wrap(font, q.stem, size, 792 - 72 - 72 - 22);
    page.drawText(`${i + 1}.`, { x: 60, y, size, font, color: rgb(0, 0, 0) });
    for (const l of lines) {
      page.drawText(l, { x: 84, y, size, font });
      y -= 18;
    }
    y -= 14;
    q.choices.forEach((c, k) => {
      page.drawText(`${String.fromCharCode(65 + k)})`, { x: 84, y, size, font });
      page.drawText(c, { x: 110, y, size, font });
      y -= 22;
    });
  });
  const bytes = await doc.save();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const key = demoQuestions.map((q, i) => ({ n: i + 1, answer: q.answer, explanation: q.explanation, tags: [q.tag], choiceCount: q.choices.length }));
  fs.mkdirSync(path.join(here, '..', 'public', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(here, '..', 'public', 'demo', 'demo-key.json'), JSON.stringify(key));
  return bytes;
}
