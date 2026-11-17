import { expect, test } from '@playwright/test';
import { fixture, freshStart, startBlock, pick } from '../e2e/helpers';
test.use({ viewport: { width: 1366, height: 860 } });
const shot = (page: import('@playwright/test').Page, n: string) => page.screenshot({ path: `${process.env.SHOTS}/${n}.png`, fullPage: true });
test('all pages', async ({ page }) => {
  test.setTimeout(240_000);
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'untimed' });
  for (const l of ['B', 'A', 'B']) { await pick(page, l); await page.getByTestId('next').click(); }
  await page.getByTestId('end-block').click();
  await page.getByTestId('grid-end').click();
  await page.getByTestId('confirm-end').click();
  await page.waitForTimeout(600);
  await shot(page, 'p-report');
  await page.getByTestId('tab-analysis').click();
  await shot(page, 'p-analysis');
  for (const [n, url] of [['p-library', './#/'], ['p-exam', './#/exam/demo-exam'], ['p-key', './#/exam/demo-exam/key'], ['p-missed', './#/missed'], ['p-settings', './#/settings'], ['p-faq', './#/faq']]) {
    await page.goto(url);
    await page.waitForTimeout(700);
    await shot(page, n);
  }
  await page.goto('./#/import');
  await page.getByTestId('question-file').setInputFiles(fixture('b-answer-after.pdf'));
  await expect(page.getByTestId('pdf-info')).toBeVisible();
  await shot(page, 'p-import');
  await page.goto('./#/');
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
  await shot(page, 'p-library-dark');
  await page.goto('./#/report/' + (await page.evaluate(() => location.hash)).slice(0, 0));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await page.goto('./#/welcome');
  await page.waitForTimeout(500);
  await shot(page, 'p-welcome-phone');
  await page.goto('./#/');
  await page.waitForTimeout(500);
  await shot(page, 'p-library-phone');
});
