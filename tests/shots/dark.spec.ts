import { expect, test } from '@playwright/test';
import { fixture, freshStart, startBlock, pick } from '../e2e/helpers';
test.use({ viewport: { width: 1366, height: 860 }, colorScheme: 'dark' });
test('dark pages', async ({ page }) => {
  test.setTimeout(120_000);
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'untimed' });
  await page.getByTestId('btn-settings').click();
  await page.getByTestId('theme-dark').click();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${process.env.SHOTS}/d-test.png` });
  await pick(page, 'B');
  await page.getByTestId('end-block').click();
  await page.getByTestId('grid-end').click();
  await page.getByTestId('confirm-end').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${process.env.SHOTS}/d-report.png`, fullPage: true });
  await page.getByTestId('tab-analysis').click();
  await page.screenshot({ path: `${process.env.SHOTS}/d-analysis.png`, fullPage: true });
  for (const [n, url] of [['d-exam', './#/exam/demo-exam'], ['d-key', './#/exam/demo-exam/key'], ['d-layout', './#/exam/demo-exam/layout'], ['d-missed', './#/missed'], ['d-settings', './#/settings'], ['d-setup', './#/setup?exam=demo-exam'], ['d-faq', './#/faq'], ['d-welcome', './#/welcome']]) {
    await page.goto(url);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${process.env.SHOTS}/${n}.png`, fullPage: true });
  }
  await page.goto('./#/import');
  await page.getByTestId('question-file').setInputFiles(fixture('b-answer-after.pdf'));
  await expect(page.getByTestId('pdf-info')).toBeVisible();
  await page.screenshot({ path: `${process.env.SHOTS}/d-import.png`, fullPage: true });
});
