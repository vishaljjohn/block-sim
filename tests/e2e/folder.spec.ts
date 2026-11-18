import { expect, test } from '@playwright/test';
import { fixture, freshStart } from './helpers';

test('import a whole folder: pairs question and answer PDFs into subject folders', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'folder upload input checked in Chromium');
  // use the cross-browser folder input (the native folder picker cannot be driven in a test)
  await page.addInitScript(() => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });
  await freshStart(page);
  await page.goto('./#/import');
  await page.getByTestId('mode-folder').click();
  await page.getByTestId('folder-input').setInputFiles(fixture('exams-folder'));
  await expect(page.getByTestId('folder-row')).toHaveCount(3);
  await expect(page.getByTestId('folder-pairs')).toContainText('Surgery');
  await expect(page.getByTestId('folder-pairs')).toContainText('1A.pdf');
  await page.getByTestId('folder-go').click();
  await expect(page.locator('[data-testid="folder-state"][data-state="waiting"], [data-testid="folder-state"][data-state="working"]')).toHaveCount(0, { timeout: 180_000 });
  await expect(page.locator('[data-testid="folder-state"][data-state="failed"]')).toHaveCount(0);
  // Surgery 1 has a full key → ready; the others have no key → need a check
  await expect(page.locator('[data-testid="folder-row"]').filter({ hasText: 'Surgery' }).getByTestId('folder-state')).toHaveAttribute('data-state', 'done');
  await page.goto('./#/exams');
  await expect(page.getByTestId('folder-Surgery')).toBeVisible();
  await expect(page.getByTestId('folder-OBGYN')).toBeVisible();
});
