import { expect, test } from '@playwright/test';
import { freshStart, pick, startBlock } from './helpers';

test('dashboard, history, reports, notes, queue and composer filters work after a finished test', async ({ page }) => {
  await freshStart(page);
  await expect(page.getByTestId('dash-exam')).toBeVisible();
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'untimed' });
  await pick(page, 'B');
  await page.getByTestId('end-block').click();
  await page.getByTestId('grid-end').click();
  await page.getByTestId('confirm-end').click();
  await expect(page.getByTestId('response-sheet')).toBeVisible();

  // history: one finished test, renamed in place
  await page.goto('./#/history');
  await expect(page.getByTestId('history-row')).toHaveCount(1);
  await page.getByTestId('history-name').click();
  await page.getByTestId('history-name-input').fill('My first block');
  await page.getByTestId('history-name-input').press('Enter');
  await expect(page.getByTestId('history-name')).toContainText('My first block');
  await page.getByTestId('history-mode-tutor').click();
  await expect(page.getByTestId('history-row')).toHaveCount(0);

  // the other pages open with the new data
  await page.goto('./#/reports');
  await expect(page.getByTestId('kpi-answered')).toContainText('1');
  await page.goto('./#/');
  await expect(page.getByTestId('dash-accuracy')).toBeVisible();
  await page.goto('./#/queue');
  await expect(page.getByTestId('queue-total')).toBeVisible();
  await page.goto('./#/notes');
  await expect(page.getByTestId('notes')).toBeVisible();
  await page.goto('./#/exams');
  await expect(page.getByTestId('on-desk')).toBeVisible();

  // composer: "unused" leaves out the question already answered
  await page.goto('./#/setup?exam=demo-exam');
  const all = await page.getByTestId('setup-summary').locator('b').first().innerText();
  await page.getByTestId('sel-unused').check();
  await expect(page.getByTestId('setup-summary').locator('b').first()).not.toHaveText(all);
  await page.getByTestId('sel-custom').check();
  await page.getByTestId('custom-numbers').fill('1-2');
  await expect(page.getByTestId('setup-summary').locator('b').first()).toHaveText('2');
});
