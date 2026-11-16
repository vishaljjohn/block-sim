import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { freshStart, startBlock } from './helpers';

// needs `npm run build:all` (stable at /block-sim/, beta at /block-sim/beta/); skipped against the live site
const hasBeta = fs.existsSync('dist/beta/index.html');

test('beta and stable keep separate data, storage and service workers', async ({ page, browserName }) => {
  test.skip(!hasBeta || !!process.env.BASE_URL, 'beta build not present');
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'untimed' });
  await page.getByTestId('btn-settings').click();
  await page.getByRole('menuitem', { name: /Save and exit/ }).click();
  await expect(page.getByTestId('resume-card')).toBeVisible();

  await page.goto('./beta/');
  const skip = page.getByTestId('welcome-skip');
  await skip.click();
  await expect(page.getByTestId('beta-badge')).toBeVisible();
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('resume-card')).toHaveCount(0);
  const dbs = await page.evaluate(async () => ((await indexedDB.databases?.()) ?? []).map((d) => d.name));
  if (browserName === 'chromium') expect(dbs).toEqual(expect.arrayContaining(['blocksim', 'blocksim-beta']));
  // service workers: stable never controls beta
  if (browserName === 'chromium') {
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()), null, { timeout: 30_000 });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
    const ctrl = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
    expect(ctrl).toContain('/block-sim/beta/sw.js');
    const caches_ = await page.evaluate(async () => caches.keys());
    expect(caches_.some((c) => c.startsWith('blocksim-beta-'))).toBe(true);
  }
  // and stable still has its unfinished block
  await page.goto('./');
  await expect(page.getByTestId('resume-card')).toBeVisible();
});
