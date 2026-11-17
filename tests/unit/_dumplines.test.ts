// LOCAL only (skipped unless DUMPWORDS is set): lines and flags from a saved word dump.
import fs from 'node:fs';
import { it } from 'vitest';
import { pageLines, matchChoiceLabel, matchQuestionStart } from '../../src/lib/detect';
it.skipIf(!process.env.DUMPWORDS)('lines', () => {
  const d = JSON.parse(fs.readFileSync(process.env.DUMPWORDS!, 'utf8'));
  const out: string[] = [];
  for (const p of d.sort((a: any, b: any) => a.page - b.page)) {
    const pl = pageLines(p.page, p.words, p.autoCrop);
    out.push(`PAGE ${p.page} words ${p.words.length} crop ${JSON.stringify(p.autoCrop)}`);
    for (const l of pl.lines) out.push(`  c${l.column} x${l.x.toFixed(3)} y${l.y.toFixed(3)} h${l.h.toFixed(3)} ${matchQuestionStart(l.text) != null ? 'Q' : ' '}${matchChoiceLabel(l.text)?.letter ?? ' '} | ${l.text.slice(0, 50)}`);
  }
  fs.writeFileSync(process.env.LINESOUT!, out.join('\n'));
});
