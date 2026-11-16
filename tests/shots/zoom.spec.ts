import { expect, test } from '@playwright/test';
import { confirmKey, freshStart, importExam, startBlock } from '../e2e/helpers';
test.use({ viewport: { width: 1366, height: 820 } });
test('zoom shot', async ({ page }) => {
  await freshStart(page);
  await importExam(page, { file: 'b-answer-after.pdf', name: 'With image', key: { inline: true }, layout: 'auto' });
  await confirmKey(page);
  await startBlock(page, { mode: 'exam' });
  await expect(page.getByTestId('zoom-image').first()).toBeVisible();
  await page.screenshot({ path: `${process.env.SHOTS}/z1.png` });
  await page.getByTestId('zoom-image').first().click();
  await page.getByTestId('zoom-img-in').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${process.env.SHOTS}/z2.png` });
});
