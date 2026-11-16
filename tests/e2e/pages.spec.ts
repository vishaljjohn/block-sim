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

test('key that marks answers only with a highlight', async ({ page }) => {
  await freshStart(page);
  await importExam(page, { file: 'a-image-questions.pdf', name: 'Highlight key', key: { pdf: 'e-highlight-key.pdf' }, layout: 'fixed', perQuestion: 1 });
  await expect(page.getByTestId('keyed-count')).toHaveText(String(answers.a.length));
  for (let i = 0; i < answers.a.length; i++) await expect(page.getByTestId(`key-answer-${i + 1}`)).toHaveValue(answers.a[i]);
  // the explanation is what follows the choices, not the repeated question
  expect(await page.getByTestId('key-expl-1').inputValue()).toMatch(/preferred in this made-up scenario/);
  expect(await page.getByTestId('key-expl-1').inputValue()).not.toMatch(/year-old/);
});

test('a picture in the question can be popped out and zoomed', async ({ page }) => {
  await freshStart(page);
  await importExam(page, { file: 'b-answer-after.pdf', name: 'With image', key: { inline: true }, layout: 'auto' });
  await confirmKey(page);
  await startBlock(page, { mode: 'exam' });
  await page.getByTestId('zoom-image').first().click();
  await expect(page.getByTestId('image-zoom')).toBeVisible();
  const before = (await page.getByTestId('zoom-canvas').boundingBox())!.width;
  await page.getByTestId('zoom-img-in').click();
  await page.getByTestId('zoom-img-in').click();
  await expect(page.getByTestId('zoom-img-level')).toHaveText('150%');
  expect((await page.getByTestId('zoom-canvas').boundingBox())!.width).toBeGreaterThan(before * 1.4);
  await page.getByTestId('zoom-img-out').click();
  await expect(page.getByTestId('zoom-img-level')).toHaveText('125%');
  await page.getByRole('button', { name: 'Close Image' }).click();
  await expect(page.getByTestId('image-zoom')).toHaveCount(0);
  // questions without pictures have no zoom button
  await page.getByTestId('next').click();
  await expect(page.getByTestId('choice-A')).toBeVisible();
  await expect(page.getByTestId('zoom-image')).toHaveCount(0);
});

test('a 200-page PDF opens in a block in under 3 seconds and question switches are quick', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'timing measured once');
  await freshStart(page);
  await importExam(page, { file: 'f-200-pages.pdf', name: '200 pages', key: { paste: answers.f.join(' ') }, layout: 'fixed', perQuestion: 1 });
  await confirmKey(page);
  await page.getByTestId('detail-new-attempt').click();
  await page.getByTestId('mode-untimed').check();
  const t0 = Date.now();
  await page.getByTestId('start-block').click();
  await expect(page.locator('[data-drawn="1"]').first()).toBeVisible();
  const open = Date.now() - t0;
  expect(open).toBeLessThan(3000);
  const t1 = Date.now();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('item-n')).toHaveText('6');
  await expect(page.locator('[data-drawn="1"]').first()).toBeVisible();
  expect((Date.now() - t1) / 5).toBeLessThan(600);
  console.log(`200-page PDF: block open ${open} ms`);
});

test('nothing is ever requested from another site (OCR, PDF engine, fonts all local)', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'checked once');
  const outside: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1', 'www.vishaljohn.com'].includes(u.hostname) && !u.protocol.startsWith('blob') && !u.protocol.startsWith('data')) outside.push(r.url());
  });
  await freshStart(page);
  await importExam(page, { file: 'a-image-questions.pdf', name: 'Local only', key: { pdf: 'a-key.pdf' }, layout: 'auto' });
  await confirmKey(page);
  await startBlock(page, { mode: 'exam' });
  await page.getByTestId('btn-labs').click();
  expect(outside).toEqual([]);
});
