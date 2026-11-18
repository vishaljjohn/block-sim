import { expect, test } from '@playwright/test';
import { freshStart, itemState, pick, startBlock } from './helpers';

test('every change survives an immediate reload (no waiting for the save)', async ({ page }) => {
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'untimed' });
  await pick(page, 'B');
  await page.getByTestId('strike-D').click();
  await page.getByTestId('mark').check();
  // highlight a word
  const pv = page.getByTestId('question-view').locator('[data-drawn="1"]').first();
  const b = (await pv.boundingBox())!;
  await page.mouse.dblclick(b.x + b.width * 0.3, b.y + b.height * 0.12);
  // reload right away
  await page.reload();
  await expect(page.getByTestId('test-screen')).toBeVisible();
  await expect(page.locator('[data-drawn="1"]').first()).toBeVisible();
  const st = await itemState(page);
  expect(st.sel.join()).toMatch(/B/);
  expect(st.struck.join()).toMatch(/D/);
  expect(st.marked).toBe(true);
});

test('if saving fails, a warning shows, the change is kept and saved once storage works again', async ({ page }) => {
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'untimed' });
  // storage starts refusing writes
  await page.evaluate(() => {
    const w = window as unknown as { __put?: typeof IDBObjectStore.prototype.put };
    w.__put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Simulated full disk', 'QuotaExceededError');
    };
  });
  await pick(page, 'C');
  await expect(page.getByTestId('save-trouble')).toBeVisible({ timeout: 10_000 });
  // storage works again: the retry saves it and the warning goes away
  await page.evaluate(() => {
    const w = window as unknown as { __put: typeof IDBObjectStore.prototype.put };
    IDBObjectStore.prototype.put = w.__put;
  });
  await expect(page.getByTestId('save-trouble')).toHaveCount(0, { timeout: 15_000 });
  await page.reload();
  await expect(page.locator('[data-drawn="1"]').first()).toBeVisible();
  expect((await itemState(page)).sel.join()).toMatch(/C/);
});
