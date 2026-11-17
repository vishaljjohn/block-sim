// LOCAL only (skipped unless LAYOUTDUMP is set): run the layout step on a saved word dump.
import fs from 'node:fs';
import { it } from 'vitest';
import { detectLayout, pageLines } from '../../src/lib/detect';
it.skipIf(!process.env.LAYOUTDUMP)('layout', () => {
  const d = JSON.parse(fs.readFileSync(process.env.LAYOUTDUMP!, 'utf8')).sort((a: any, b: any) => a.page - b.page);
  const lay = detectLayout(d.map((p: any) => pageLines(p.page, p.words, p.autoCrop)), { inlineAnswers: true });
  const out = [`questions ${lay.questions.length} confidence ${lay.confidence.toFixed(2)} multi ${lay.multiPerPage}`];
  for (const q of lay.questions.slice(0, 20)) out.push(`${q.number}: ${q.segments.map((s) => s.page + (s.rect ? `[${s.rect.y.toFixed(2)}-${(s.rect.y + s.rect.h).toFixed(2)}]` : '')).join('+')} ans ${q.inlineAnswer ?? '-'} list ${q.answerList?.choices.length ?? 0}@${q.answerList?.page ?? ''} expl ${q.inlineExplanation?.length ?? 0}`);
  fs.writeFileSync(process.env.LAYOUTOUT!, out.join('\n'));
});
