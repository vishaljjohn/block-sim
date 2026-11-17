import { expect, test } from '@playwright/test';
import { confirmKey, freshStart, importExam, startBlock } from './helpers';

test('double-click highlights a word; part of a word can be highlighted; answer choices cannot', async ({ page }, info) => {
  test.skip(info.project.name === 'ipad', 'mouse');
  await freshStart(page);
  await importExam(page, { file: 'b-answer-after.pdf', name: 'HL', key: { inline: true }, layout: 'auto' });
  await confirmKey(page);
  await startBlock(page, { mode: 'untimed' });
  await page.getByTestId('next').click(); // question 2 has no picture
  await expect(page.getByTestId('choice-A')).toBeVisible();
  const q = (await page.getByTestId('question-view').boundingBox())!;
  const hl = page.getByTestId('highlight');

  // double-click a word in the stem
  await page.mouse.dblclick(q.x + q.width * 0.3, q.y + q.height * 0.12);
  await expect(hl).toHaveCount(1);
  const one = (await hl.first().boundingBox())!;
  expect(one.width).toBeLessThan(q.width * 0.2); // a single word, not the line

  // dragging inside the answer choices does not highlight
  const a = (await page.getByTestId('choice-A').boundingBox())!;
  const c = (await page.getByTestId('choice-C').boundingBox())!;
  await page.mouse.move(a.x + a.width * 0.4, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width * 0.6, c.y + c.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(hl).toHaveCount(1);

  // a short drag inside one word highlights only part of it
  await page.mouse.move(q.x + q.width * 0.5, q.y + q.height * 0.16);
  await page.mouse.down();
  await page.mouse.move(q.x + q.width * 0.505, q.y + q.height * 0.16, { steps: 4 });
  await page.mouse.up();
  await expect(hl).toHaveCount(2);
  const part = (await hl.nth(1).boundingBox())!;
  expect(part.width).toBeLessThan(one.width * 0.9);
});
