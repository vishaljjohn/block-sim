import { expect, test } from '@playwright/test';
import { answers, confirmKey, freshStart, importExam, startBlock } from './helpers';

test('settings panel: theme, size, bold, layout, highlighting; strike buttons; markings kept in review', async ({ page }, info) => {
  test.skip(info.project.name === 'ipad', 'mouse dragging');
  await freshStart(page);
  await importExam(page, { file: 'd-two-column.pdf', name: 'Settings', key: { paste: answers.d.join(' ') }, layout: 'auto' });
  await confirmKey(page);
  await startBlock(page, { mode: 'exam' });
  await expect(page.getByTestId('choice-A')).toBeVisible();

  // strike-out button to the right of a choice, toggles on and off
  await page.getByTestId('strike-B').click();
  await expect(page.getByTestId('choice-B')).toHaveAttribute('data-struck', '1');
  await page.getByTestId('strike-C').click();
  await page.getByTestId('strike-C').click();
  await expect(page.getByTestId('choice-C')).toHaveAttribute('data-struck', '0');
  await page.getByTestId('choice-A').click();
  await expect(page.getByTestId('choice-A')).toHaveAttribute('data-selected', '1');

  // settings panel
  await page.getByTestId('btn-settings').click();
  await expect(page.getByTestId('display-settings')).toBeVisible();
  const w0 = (await page.getByTestId('question-view').boundingBox())!.width;
  await page.getByTestId('size-XL').click();
  await expect.poll(async () => (await page.getByTestId('question-view').boundingBox())!.width).toBeGreaterThan(w0 * 1.1);
  await page.getByTestId('theme-dark').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByTestId('bold-true').click();
  await expect(page.locator('html')).toHaveClass(/bold-text/);
  await page.getByTestId('layout-default').click();
  await expect(page.locator('html')).toHaveClass(/layout-default/);
  await page.getByTestId('hlcolor-green').click();
  await page.getByTestId('hlmode-manual').click();
  await page.keyboard.press('Escape');

  // manual highlighting: drag, then pick pink
  const q = (await page.getByTestId('question-view').boundingBox())!;
  const drag = async (y: number) => {
    await page.mouse.move(q.x + q.width * 0.12, q.y + q.height * y);
    await page.mouse.down();
    await page.mouse.move(q.x + q.width * 0.3, q.y + q.height * y, { steps: 6 });
    await page.mouse.up();
  };
  await drag(0.05);
  await expect(page.getByTestId('highlight-picker')).toBeVisible();
  await expect(page.getByTestId('highlight')).toHaveCount(0);
  await page.getByTestId('pick-pink').click();
  await expect(page.locator('[data-testid="highlight"][data-color="pink"]').first()).toBeVisible();
  // quick mode uses the default color (green)
  await page.getByTestId('btn-settings').click();
  await page.getByTestId('hlmode-quick').click();
  await page.keyboard.press('Escape');
  await drag(0.1);
  await expect(page.locator('[data-testid="highlight"][data-color="green"]').first()).toBeVisible();

  // settings are remembered after a reload
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);

  // finish and review: strike-outs and highlights are still there
  await page.getByTestId('end-block').click();
  await page.getByTestId('grid-end').click();
  await page.getByTestId('confirm-end').click();
  await page.getByTestId('review-all').click();
  await expect(page.getByTestId('review-screen')).toBeVisible();
  await expect(page.getByTestId('choice-B')).toHaveAttribute('data-struck', '1');
  await expect(page.locator('[data-testid="highlight"][data-color="pink"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="highlight"][data-color="green"]').first()).toBeVisible();
  // review is read-only: no strike buttons
  await expect(page.getByTestId('strike-B')).toHaveCount(0);
});

test('timer pop-up: switch to Tutor mid-block, back to Timed, add time', async ({ page }) => {
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'exam' });
  await page.getByTestId('timer').click();
  await expect(page.getByTestId('timer-popup')).toBeVisible();
  await page.getByTestId('timer-mode-tutor').check();
  await page.getByTestId('timer-done').click();
  await expect(page.getByTestId('test-screen')).toHaveAttribute('data-mode', 'tutor');
  const pickA = page.getByTestId('choice-A').or(page.getByTestId('bubble-A')).first();
  await pickA.click();
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('explanation-panel')).toBeVisible();
  await expect(page.getByTestId('proceed')).toBeVisible();
  await page.getByTestId('proceed').click();
  await expect(page.getByTestId('item-n')).toHaveText('2');
  await page.getByTestId('timer').click();
  await page.getByTestId('timer-mode-exam').check();
  const before = await page.getByTestId('timer-popup-remaining').textContent();
  await page.getByTestId('add-time-10').click();
  const after = await page.getByTestId('timer-popup-remaining').textContent();
  const secs = (s: string | null) => s!.replace(/.*: /, '').split(':').reduce((a, b) => a * 60 + Number(b), 0);
  expect(secs(after) - secs(before)).toBeGreaterThanOrEqual(598);
});

test('review: highlight in the explanation (kept), question fits at XL next to the explanation', async ({ page }, info) => {
  test.skip(info.project.name === 'ipad', 'mouse selection');
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'untimed' });
  await page.getByTestId('end-block').click();
  await page.getByTestId('grid-end').click();
  await page.getByTestId('confirm-end').click();
  await page.getByTestId('review-all').click();
  await page.getByTestId('btn-settings').click();
  await page.getByTestId('size-XL').click();
  await page.keyboard.press('Escape');
  const qv = (await page.getByTestId('question-view').boundingBox())!;
  const ex = (await page.getByTestId('explanation-panel').boundingBox())!;
  expect(qv.x + qv.width).toBeLessThanOrEqual(ex.x + 2);
  expect(ex.x + ex.width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 1366) + 1);
  // select some words in the explanation → highlighted, and still there after a reload
  // (the panel may still be settling after the size change: measure again on each try)
  await expect(async () => {
    const t = page.getByTestId('explanation-text').locator('span').first();
    const b = (await t.boundingBox())!;
    await page.mouse.move(b.x + 2, b.y + 6);
    await page.mouse.down();
    await page.mouse.move(b.x + 120, b.y + 6, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('expl-highlight').first()).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId('expl-highlight').first()).toBeVisible();
});

test('item box hides the question list; full screen button; type minutes; tutor can be timed', async ({ page }, info) => {
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await page.getByTestId('detail-new-attempt').click();
  await page.getByTestId('mode-tutor').check();
  await expect(page.getByTestId('timed-on')).toBeChecked();
  await page.getByTestId('start-block').click();
  await expect(page.getByTestId('test-screen')).toHaveAttribute('data-mode', 'tutor');
  await expect(page.getByTestId('mode-chip')).toHaveText(/Tutor · Timed/);
  // iPad Safari has no full screen for web pages, so the button is left out there
  if (info.project.name !== 'ipad') await expect(page.getByTestId('btn-fullscreen')).toBeVisible();
  // the item box opens and closes the question list
  const nav = page.getByRole('navigation', { name: 'Question status' });
  await expect(nav).toBeVisible();
  await page.getByTestId('item-box').click();
  await expect(nav).toHaveCount(0);
  await page.getByTestId('item-box').click();
  await expect(nav).toBeVisible();
  // type a number of minutes
  await page.getByTestId('timer').click();
  const secs = (s: string | null) => s!.replace(/.*: /, '').split(':').reduce((a, b) => a * 60 + Number(b), 0);
  const before = secs(await page.getByTestId('timer-popup-remaining').textContent());
  await page.getByTestId('custom-minutes').fill('-2');
  await page.getByTestId('apply-minutes').click();
  const after = secs(await page.getByTestId('timer-popup-remaining').textContent());
  expect(before - after).toBeGreaterThanOrEqual(115);
  expect(before - after).toBeLessThanOrEqual(125);
  await page.getByTestId('timer-untimed').check();
  await expect(page.getByTestId('mode-chip')).toHaveText(/Tutor · Untimed/);
  await expect(page.getByTestId('settings-menu')).toHaveCount(0);
});

test('folder picker: pick a listed folder or type a new one', async ({ page }) => {
  await freshStart(page);
  await page.goto('./#/');
  await page.getByTestId('exam-row-demo-exam').getByText('Move').click();
  await page.getByTestId('move-folder').selectOption('Surgery');
  await page.getByRole('dialog').getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByTestId('folder-Surgery')).toBeVisible();
  await page.getByTestId('exam-row-demo-exam').getByText('Move').click();
  await page.getByTestId('move-folder').selectOption({ label: 'New folder…' });
  await page.getByTestId('move-folder-name').fill('My Shelf');
  await page.getByRole('dialog').getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByTestId('folder-My Shelf')).toBeVisible();
});
