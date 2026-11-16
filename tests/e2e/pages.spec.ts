import { expect, test } from '@playwright/test';
import { answers, confirmKey, freshStart, importExam, startBlock } from './helpers';

test.describe.configure({ timeout: 240_000 });

test('image-only PDF: OCR finds the layout, crops the clutter and makes choices clickable', async ({ page }, info) => {
  await freshStart(page);
  await importExam(page, { file: 'a-image-questions.pdf', name: 'OCR exam', key: { pdf: 'a-key.pdf' }, layout: 'auto' });
  await expect(page.getByTestId('keyed-count')).toHaveText('6');
  await expect(page.getByTestId('count-mismatch')).toHaveCount(0);
  await confirmKey(page);
  await startBlock(page, { mode: 'exam' });
  // clickable choices on the page, no bubble panel
  await expect(page.getByTestId('choice-A')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('answer-box')).toHaveCount(0);
  // the crop removed the browser bar, header strip and dock: the visible area is wider than tall by a lot less than the page
  const box = (await page.getByTestId('question-view').boundingBox())!;
  expect(box.height / box.width).toBeLessThan(500 / 800 - 0.05);
  // select by clicking the choice on the page
  await page.getByTestId(`choice-${answers.a[0]}`).click();
  await expect(page.getByTestId(`choice-${answers.a[0]}`)).toHaveAttribute('data-selected', '1');
  // strike out with right-click
  const other = answers.a[0] === 'A' ? 'B' : 'A';
  if (info.project.name !== 'ipad') {
    await page.getByTestId(`choice-${other}`).click({ button: 'right' });
    await expect(page.getByTestId(`choice-${other}`)).toHaveAttribute('data-struck', '1');
    // word-snapped highlight: drag inside the stem
    const qb = (await page.getByTestId('question-view').boundingBox())!;
    await page.mouse.move(qb.x + qb.width * 0.15, qb.y + qb.height * 0.12);
    await page.mouse.down();
    await page.mouse.move(qb.x + qb.width * 0.5, qb.y + qb.height * 0.12, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('highlight').first()).toBeVisible();
  }
});

test('"Answer: C" after each question is hidden during the test and used as the key', async ({ page }) => {
  await freshStart(page);
  await importExam(page, { file: 'b-answer-after.pdf', name: 'Inline', key: { inline: true }, layout: 'auto' });
  await expect(page.getByTestId('keyed-count')).toHaveText(String(answers.b.length));
  for (let i = 0; i < answers.b.length; i++) await expect(page.getByTestId(`key-answer-${i + 1}`)).toHaveValue(answers.b[i]);
  await confirmKey(page);
  await startBlock(page, { mode: 'exam' });
  await expect(page.getByTestId('choice-A')).toBeVisible();
  // the visible region stops above the answer line: the page text layer is not selectable in a test, so check the region height
  const box = (await page.getByTestId('question-view').boundingBox())!;
  expect(box.height).toBeLessThan(box.width * 0.75);
});

test('several questions per page are split; key table at the end of the same PDF', async ({ page }) => {
  await freshStart(page);
  await importExam(page, { file: 'c-multi-per-page.pdf', name: 'Multi', key: { samePage: 4 }, layout: 'auto' });
  await expect(page.getByTestId('keyed-count')).toHaveText('9');
  for (let i = 0; i < 9; i++) await expect(page.getByTestId(`key-answer-${i + 1}`)).toHaveValue(answers.c[i]);
  await confirmKey(page);
  await startBlock(page, { mode: 'tutor' });
  await expect(page.getByTestId('choice-D')).toBeVisible();
  await expect(page.getByTestId('choice-E')).toHaveCount(0);
});

test('two-column PDF with choices up to H', async ({ page }) => {
  await freshStart(page);
  await importExam(page, { file: 'd-two-column.pdf', name: 'Two col', key: { paste: answers.d.join('\n') }, layout: 'auto' });
  await expect(page.getByTestId('keyed-count')).toHaveText('4');
  await confirmKey(page);
  await startBlock(page, { mode: 'untimed' });
  await expect(page.getByTestId('choice-H')).toBeVisible();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('choice-H')).toBeVisible();
  await page.keyboard.press('g');
  await expect(page.getByTestId('choice-G')).toHaveAttribute('data-selected', '1');
});
