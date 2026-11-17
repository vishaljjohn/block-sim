import { expect, test } from '@playwright/test';
import { fixture, freshStart, startBlock, pick } from '../e2e/helpers';
test.use({ viewport: { width: 1440, height: 900 } });
test('library + report shots', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => { delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker; });
  await freshStart(page);
  await page.goto('./#/import');
  await page.getByTestId('mode-folder').click();
  await page.getByTestId('folder-input').setInputFiles(fixture('exams-folder'));
  await page.screenshot({ path: `${process.env.SHOTS}/l0.png`, fullPage: true });
  await page.getByTestId('folder-go').click();
  await expect(page.locator('[data-testid="folder-state"][data-state="working"], [data-testid="folder-state"][data-state="waiting"]')).toHaveCount(0, { timeout: 180_000 });
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'untimed' });
  for (const l of ['B', 'A', 'B']) { await pick(page, l); await page.getByTestId('next').click(); }
  await page.getByTestId('end-block').click();
  await page.getByTestId('grid-end').click();
  await page.getByTestId('confirm-end').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${process.env.SHOTS}/r1.png`, fullPage: true });
  await page.getByTestId('tab-analysis').click();
  await page.screenshot({ path: `${process.env.SHOTS}/r2.png`, fullPage: true });
  await page.goto('./#/');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${process.env.SHOTS}/l1.png`, fullPage: true });
});
