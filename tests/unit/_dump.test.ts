import fs from 'node:fs';
import { it } from 'vitest';
import { pageLines, detectChoices, matchChoiceLabel } from '../../src/lib/detect';
it.skipIf(!process.env.DUMPFILE)('dump', () => {
  const d = JSON.parse(fs.readFileSync(process.env.DUMPFILE!, 'utf8'));
  for (const p of d) {
    const pl = pageLines(p.page, p.words, p.autoCrop);
    const ch = detectChoices(pl.lines, p.page, p.autoCrop, p.words);
    console.log('PAGE', p.page, 'crop', JSON.stringify(p.autoCrop), 'choices', ch.choices.map((c) => c.letter).join(''), 'conf', ch.confidence);
    for (const l of pl.lines) console.log(`  c${l.column} x${l.x.toFixed(3)} y${l.y.toFixed(3)} conf${l.conf.toFixed(2)} ${matchChoiceLabel(l.text) ? '*' : ' '} ${l.text.slice(0, 45)}`);
  }
});
