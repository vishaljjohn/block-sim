/**
 * LOCAL ONLY (skipped unless FLOWS=1). Drives real exam flows on private PDFs and saves screenshots to
 * /private-results/flows (git-ignored) for a visual check. Never prints question text.
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('private-results/flows');
const pdf = (folder: string, f: string) => path.resolve('private-test', folder, f);
const shot = (page: Page, n: string) => page.screenshot({ path: path.join(OUT, n + '.png') });

test.skip(!process.env.FLOWS, 'local only');
test.use({ viewport: { width: 1440, height: 900 } });

async function fresh(page: Page) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.goto('./vendor/pdfjs/iccs/LICENSE');
  await page.evaluate(async () => {
    localStorage.clear();
    for (const n of ['blocksim', 'blocksim-beta']) await new Promise((r) => { const q = indexedDB.deleteDatabase(n); q.onsuccess = q.onerror = () => r(null); });
  });
}

async function importPair(page: Page, q: string, a: string) {
  await page.goto('./#/import');
  await page.getByTestId('question-file').setInputFiles(q);
  await expect(page.getByTestId('pdf-info')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('src-pdf').check();
  await page.getByTestId('key-file').setInputFiles(a);
  await page.getByTestId('import-go').click();
  await expect(page.getByTestId('key-check')).toBeVisible({ timeout: 20 * 60_000 });
  await page.getByRole('button', { name: 'Key looks right: save' }).click();
  await expect(page.getByTestId('exam-detail')).toBeVisible();
}

async function goToItem(page: Page, n: number) {
  await page.getByRole('button', { name: new RegExp(`^Question ${n},`) }).click();
  await expect(page.getByTestId('item-n')).toHaveText(String(n));
  await expect(page.locator('[data-drawn="1"]').first()).toBeVisible();
  await page.waitForTimeout(400);
}

test('surgery 5: pictures, highlighting on choices, bubbles, timer, review', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await fresh(page);
  await importPair(page, pdf('2 Surgery', '5 Q.pdf'), pdf('2 Surgery', '5A.pdf'));
  await page.getByTestId('detail-new-attempt').click();
  await page.getByTestId('mode-untimed').check();
  await page.getByTestId('start-block').click();
  await expect(page.getByTestId('test-screen')).toBeVisible();
  await goToItem(page, 16);
  await shot(page, 's5-q16');
  await goToItem(page, 15);
  await shot(page, 's5-q15');
  // drag from the stem down across the choices: nothing on the choices may be highlighted
  const view = page.getByTestId('question-view');
  const b = (await view.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.12);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.85, { steps: 8 });
  await page.mouse.up();
  await shot(page, 's5-q15-drag');
  // bubbles mode, then the same drag
  await page.getByText('Choices look wrong? Use bubbles').first().click();
  await page.waitForTimeout(500);
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.45, b.y + b.height * 0.9, { steps: 8 });
  await page.mouse.up();
  await shot(page, 's5-q15-bubbles-drag');
  await page.getByTestId('timer').click();
  await shot(page, 's5-timer');
  await page.getByTestId('timer-done').click();
  await page.getByTestId('end-block').click();
  await page.getByTestId('grid-end').click();
  await page.getByTestId('confirm-end').click();
  await page.waitForTimeout(800);
  await shot(page, 's5-report');
  await page.getByTestId('review-all').click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, 's5-review');
});
