import { expect, test } from '@playwright/test';
import { answers, confirmKey, freshStart, importExam, startBlock } from '../e2e/helpers';

const OUT = process.env.SHOTS ?? 'test-results/shots';
test.use({ viewport: { width: Number(process.env.VW ?? 1512), height: Number(process.env.VH ?? 945) }, deviceScaleFactor: 1 });

test('screenshots', async ({ page }) => {
  test.setTimeout(240_000);
  await freshStart(page);
  await importExam(page, { file: 'a-image-questions.pdf', name: 'Fixture A: image-only', key: { pdf: 'a-key.pdf' }, layout: 'auto' });
  await page.screenshot({ path: `${OUT}/1-keycheck.png` });
  await confirmKey(page);
  await startBlock(page, { mode: 'exam' });
  await expect(page.getByTestId('choice-A')).toBeVisible();
  await page.getByTestId('choice-B').click();
  await page.getByTestId('choice-D').click({ button: 'right' });
  await page.getByTestId('mark').check();
  const qb = (await page.getByTestId('question-view').boundingBox())!;
  await page.mouse.move(qb.x + qb.width * 0.2, qb.y + qb.height * 0.12);
  await page.mouse.down();
  await page.mouse.move(qb.x + qb.width * 0.55, qb.y + qb.height * 0.2, { steps: 8 });
  await page.mouse.up();
  await page.screenshot({ path: `${OUT}/2-test.png` });
  await page.getByTestId('btn-labs').click();
  await page.getByTestId('btn-calc').click();
  await page.screenshot({ path: `${OUT}/3-tools.png` });
  await page.keyboard.press('Escape');
  await page.getByTestId('end-block').click();
  await page.screenshot({ path: `${OUT}/4-grid.png` });
  await page.getByTestId('grid-end').click();
  await page.getByTestId('confirm-end').click();
  await expect(page.getByTestId('report')).toBeVisible();
  await page.screenshot({ path: `${OUT}/5-report.png`, fullPage: true });
  await page.getByTestId('review-all').click();
  await expect(page.getByTestId('explanation-panel')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/6-review.png` });
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'untimed' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/7-demo.png` });
  for (const [name, url] of [['8-home', './#/'], ['9-missed', './#/missed'], ['10-weak', './#/weak'], ['11-settings', './#/settings'], ['12-faq', './#/faq'], ['13-welcome', './#/welcome'], ['14-import', './#/import']]) {
    await page.goto(url);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  void answers;
});
