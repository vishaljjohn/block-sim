import { expect, test } from '@playwright/test';
import { freshStart, pick, startBlock } from './helpers';

const DAY = 86_400_000;

test('missed bank, redo, spaced schedule and "Due for review"', async ({ page }) => {
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'untimed' });
  // demo answers: B C B D B → answer A everywhere: all wrong except none
  for (let n = 1; n <= 5; n++) {
    await pick(page, 'A');
    if (n < 5) await page.getByTestId('next').click();
  }
  await page.getByTestId('end-block').click();
  await page.getByTestId('grid-end').click();
  await page.getByTestId('confirm-end').click();
  await expect(page.getByTestId('score-wrong')).toHaveText('5');

  await page.goto('./#/missed');
  await expect(page.getByTestId('missed-count')).toContainText('5');
  await expect(page.getByTestId('missed-row-1')).toBeVisible();
  // click a row → review with original markings
  await page.getByTestId('missed-row-2').click();
  await expect(page.getByTestId('review-screen')).toBeVisible();
  await expect(page.getByTestId('item-n')).toHaveText('2');

  // not due yet
  await page.goto('./#/');
  await expect(page.getByTestId('due-card')).toHaveCount(0);

  // four days later everything is due
  const t0 = Date.now();
  await page.clock.install({ time: t0 + 4 * DAY });
  await page.reload();
  await expect(page.getByTestId('due-card')).toBeVisible();
  await expect(page.getByTestId('due-count')).toHaveText('5');
  await page.getByTestId('due-start').click();
  await expect(page.getByTestId('redo-page')).toBeVisible();
  await expect(page.locator('[data-drawn="1"]').first()).toBeVisible();
  // redo Q1 correctly (B)
  await pick(page, 'B');
  await page.getByTestId('redo-submit').click();
  await expect(page.getByTestId('redo-result')).toHaveText('Correct');
  await expect(page.getByTestId('redo-explanation')).toBeVisible();

  await page.goto('./#/missed');
  await page.getByTestId('f-status').selectOption('all');
  await expect(page.getByTestId('missed-row-1').getByTestId('missed-status')).toHaveText('Reviewing');

  // a week later redo Q1 correctly again → Mastered
  await page.clock.setFixedTime(t0 + 12 * DAY);
  await page.goto(`./#/redo?q=${encodeURIComponent('demo-exam:q1')}`);
  await page.reload();
  await expect(page.getByTestId('redo-page')).toBeVisible();
  await expect(page.locator('[data-drawn="1"]').first()).toBeVisible();
  await pick(page, 'B');
  await page.getByTestId('redo-submit').click();
  await page.goto('./#/missed');
  await page.getByTestId('f-status').selectOption('all');
  await expect(page.getByTestId('missed-row-1').getByTestId('missed-status')).toHaveText('Mastered');

  // quiz me builds a block from the filtered list
  await page.getByTestId('f-status').selectOption('active');
  await page.getByTestId('quiz-me').click();
  await expect(page.getByTestId('block-setup')).toBeVisible();
  await expect(page.getByTestId('setup-summary')).toContainText('4 questions');
  await page.getByTestId('start-block').click();
  await expect(page.getByTestId('test-screen')).toBeVisible();
});
