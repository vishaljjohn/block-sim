import { expect, test } from '@playwright/test';
import { freshStart, startBlock } from '../e2e/helpers';
test.use({ viewport: { width: 1366, height: 860 } });
test('settings shots', async ({ page }) => {
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'exam' });
  await expect(page.getByTestId('choice-A')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('strike-C').click();
  await page.getByTestId('btn-settings').click();
  await page.screenshot({ path: `${process.env.SHOTS}/s1.png` });
  await page.getByTestId('theme-dark').click();
  await page.getByTestId('layout-default').click();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${process.env.SHOTS}/s2.png` });
});
