import { expect, test } from '@playwright/test';
import { answers, confirmKey, fixture, freshStart, importExam, itemState, pick as pickAnswer, startBlock } from './helpers';

const isTouch = (name: string) => name === 'ipad';

test('import image-only PDF + separate key, take an exam block, refresh mid-block, score, review', async ({ page }, info) => {
  await freshStart(page);
  await importExam(page, { file: 'a-image-questions.pdf', name: 'Fixture A', key: { pdf: 'a-key.pdf' }, layout: 'fixed', perQuestion: 1 });
  await expect(page.getByTestId('keyed-count')).toHaveText('6');
  await expect(page.getByTestId('key-row-1')).toBeVisible();
  expect(await page.getByTestId('key-answer-1').inputValue()).toBe(answers.a[0]);
  expect(await page.getByTestId('key-expl-2').inputValue()).toContain('Numbers like this at the start of a line');
  await confirmKey(page);
  await startBlock(page, { mode: 'exam' });

  // Q1: pick the right answer with a bubble, strike one choice, mark it, highlight
  const right = answers.a[0];
  const wrong1 = right === 'A' ? 'B' : 'A';
  const bubbleMode = (await page.getByTestId(`bubble-${right}`).count()) > 0;
  const pick = async (l: string) => (bubbleMode ? page.getByTestId(`bubble-${l}`).click() : page.getByTestId(`choice-${l}`).click());
  await pick(right);
  if (bubbleMode) await page.getByTestId(`strike-${wrong1}`).click();
  else await page.getByTestId(`choice-${wrong1}`).click({ button: 'right' });
  await page.getByTestId('mark').check();
  const q = page.getByTestId('question-view');
  const box = (await q.boundingBox())!;
  if (!isTouch(info.project.name)) {
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.27, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('highlight').first()).toBeVisible();
  }
  // Q2: wrong answer, then change it (wrong→wrong) ; Q3 blank ; Q4 right via keyboard
  await page.getByTestId('next').click();
  await expect(page.getByTestId('item-n')).toHaveText('2');
  const w2 = answers.a[1] === 'A' ? 'B' : 'A';
  await pick(w2);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('item-n')).toHaveText('4');
  await page.keyboard.press(answers.a[3]);

  // refresh mid-block: everything comes back
  await page.reload();
  await expect(page.getByTestId('test-screen')).toBeVisible();
  await expect(page.getByTestId('item-n')).toHaveText('4');
  await page.getByTestId('nav-1').click();
  await expect(page.getByTestId('item-n')).toHaveText('1');
  if (!isTouch(info.project.name)) await expect(page.getByTestId('highlight').first()).toBeVisible();
  const s1 = await itemState(page);
  expect(s1.marked).toBe(true);
  expect(s1.sel.some((t) => t?.endsWith(`-${right}`))).toBe(true);
  expect(s1.struck.some((t) => t?.endsWith(`-${wrong1}`))).toBe(true);
  if (!isTouch(info.project.name)) expect(s1.highlights).toBeGreaterThan(0);
  await expect(page.getByTestId('nav-1')).toHaveAttribute('data-marked', '1');

  // end block via review grid
  await page.getByTestId('end-block').click();
  await expect(page.getByTestId('grid-summary')).toContainText('Answered: 3');
  await page.getByTestId('review-incomplete').click();
  await expect(page.getByTestId('nav-filter')).toBeVisible();
  await page.getByTestId('end-block').click();
  await page.getByTestId('grid-end').click();
  await page.getByTestId('confirm-end').click();
  await expect(page.getByTestId('report')).toBeVisible();
  await expect(page.getByTestId('score-correct')).toHaveText('2');
  await expect(page.getByTestId('score-wrong')).toHaveText('1');
  await expect(page.getByTestId('score-blank')).toHaveText('3');

  // review: markings exactly as left, answer colored, explanation shown
  await page.getByTestId('review-all').click();
  await expect(page.getByTestId('review-screen')).toBeVisible();
  await expect(page.getByTestId('result-word')).toHaveText('Correct');
  if (!isTouch(info.project.name)) await expect(page.getByTestId('highlight').first()).toBeVisible();
  const r1 = await itemState(page);
  expect(r1.struck.some((t) => t?.endsWith(`-${wrong1}`))).toBe(true);
  if (!isTouch(info.project.name)) expect(r1.highlights).toBeGreaterThan(0);
  await expect(page.getByTestId('explanation-panel')).toContainText('Numbers like this at the start of a line');
  await page.getByTestId('review-filter').selectOption('incorrect');
  await expect(page.getByTestId('item-n')).toHaveText('2');
  await expect(page.getByTestId('result-word')).toHaveText('Incorrect');
  await page.getByTestId('reason-knowledge').click();
  await page.getByTestId('review-note').fill('Remember the protocol.');
  await page.reload();
  await expect(page.getByTestId('review-note')).toHaveValue(/Remember the protocol/);
});

test('pasted key + tutor mode reveals answers immediately', async ({ page }) => {
  await freshStart(page);
  await importExam(page, { file: 'd-two-column.pdf', name: 'Fixture D', key: { paste: answers.d.map((a, i) => `${i + 1} ${a}`).join(', ') }, layout: 'fixed', perQuestion: 1 });
  await expect(page.getByTestId('keyed-count')).toHaveText(/\d+/);
  await confirmKey(page);
  await startBlock(page, { mode: 'tutor' });
  await pickAnswer(page, answers.d[0]);
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('result-word')).toHaveText(/Correct|Incorrect/);
  await expect(page.getByTestId('explanation-panel')).toBeVisible();
});

test('backup, wipe, restore', async ({ page }) => {
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'untimed' });
  await pickAnswer(page, 'B');
  await page.getByTestId('end-block').click();
  await page.getByTestId('grid-end').click();
  await page.getByTestId('confirm-end').click();
  await expect(page.getByTestId('report')).toBeVisible();
  await page.goto('./#/settings');
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-all').click();
  const file = await (await dl).path();
  await page.getByTestId('wipe').click();
  await page.getByTestId('wipe-confirm-text').fill('DELETE');
  await page.getByTestId('wipe-confirm').click();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.goto('./#/settings');
  await page.getByTestId('restore-file').setInputFiles(file!);
  await expect(page.getByTestId('settings-msg')).toContainText('Restored');
  await page.goto('./#/exam/demo-exam');
  await expect(page.getByTestId('attempt-list')).toContainText(/untimed/i);
});

test('second tab shows "open elsewhere" and can take over', async ({ page, context }) => {
  await freshStart(page);
  const p2 = await context.newPage();
  await p2.goto(page.url());
  await expect(p2.getByTestId('tab-guard')).toBeVisible();
  await p2.getByTestId('take-over').click();
  await expect(p2.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('tab-guard')).toBeVisible();
  await p2.close();
});

test('update banner never shows during a block', async ({ page }) => {
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'exam' });
  await page.evaluate(() => (window as unknown as { __blocksimFakeUpdate: () => void }).__blocksimFakeUpdate());
  await page.waitForTimeout(300);
  await expect(page.getByTestId('update-banner')).toHaveCount(0);
  await page.getByTestId('btn-settings').click();
  await page.getByRole('menuitem', { name: /Save and exit/ }).click();
  await expect(page.getByTestId('update-banner')).toBeVisible();
});

test('lab values, calculator, notes and keyboard', async ({ page }) => {
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  // untimed: no full screen, so Esc reaches the page in every browser (in full screen Safari uses Esc to leave it)
  await startBlock(page, { mode: 'untimed' });
  await page.keyboard.press('Alt+L');
  await expect(page.getByTestId('lab-panel')).toBeVisible();
  // the panel fills the height between the bars
  const lab = (await page.getByTestId('lab-panel').boundingBox())!;
  expect(lab.height).toBeGreaterThan((page.viewportSize()?.height ?? 800) - 140);
  // search highlights matches without hiding the other rows; tabs with matches light up
  const rows = await page.locator('[data-testid="lab-rows"] tbody tr').count();
  await page.getByTestId('lab-search').fill('creatin');
  await expect(page.locator('[data-testid="lab-rows"] mark').first()).toBeVisible();
  expect(await page.locator('[data-testid="lab-rows"] tbody tr').count()).toBe(rows);
  await expect(page.getByTestId('lab-tab-serum')).toHaveAttribute('data-hit', '1');
  await expect(page.getByTestId('lab-tab-csf')).toHaveAttribute('data-hit', '0');
  // SI adds a column; the reference range column stays
  await page.getByTestId('lab-si').check();
  await expect(page.getByTestId('lab-si-col')).toBeVisible();
  await expect(page.getByTestId('lab-rows')).toContainText('136–146 mEq/L');
  await expect(page.getByTestId('lab-rows')).toContainText('136–146 mmol/L');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lab-panel')).toHaveCount(0);
  await page.getByTestId('btn-calc').click();
  for (const k of ['7', '×', '6', '=']) await page.getByTestId(`calc-${k}`).click();
  await expect(page.getByTestId('calc-display')).toHaveText('42');
  await page.keyboard.press('Escape');
  await page.getByTestId('btn-notes').click();
  await page.getByTestId('notes-text').fill('check sodium');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+M');
  await expect(page.getByTestId('mark')).toBeChecked();
  await page.keyboard.press('n');
  await expect(page.getByTestId('item-n')).toHaveText('2');
  await page.keyboard.press('p');
  await page.getByTestId('btn-notes').click();
  await expect(page.getByTestId('notes-text')).toHaveValue('check sodium');
});

test('missing answers are flagged on the key check screen', async ({ page }) => {
  await freshStart(page);
  await importExam(page, { file: 'c-multi-per-page.pdf', name: 'Fixture C none', key: {}, layout: 'fixed', perQuestion: 1 });
  await expect(page.getByTestId('warning-count')).toBeVisible();
  await page.getByTestId('next-warning').click();
  await page.getByTestId('key-answer-1').fill('c');
  await expect(page.getByTestId('key-answer-1')).toHaveValue('C');
  void fixture;
});

test('timer: a sleep gap over 60 s auto-pauses at the moment it went away, and resumes from there', async ({ page }) => {
  await page.clock.install();
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'exam' });
  await page.clock.runFor(5000);
  const before = await page.getByTestId('timer-value').textContent();
  // the computer "sleeps" for 10 minutes: no ticks, then the wall clock jumps
  await page.clock.setSystemTime(Date.now() + 10 * 60_000);
  await expect(page.getByTestId('paused-screen')).toContainText('away', { timeout: 10_000 });
  await page.getByTestId('resume').click();
  const after = await page.getByTestId('timer-value').textContent();
  const secs = (s: string | null) => s!.split(':').reduce((a, b) => a * 60 + Number(b), 0);
  // nothing was lost while asleep (a second or two of slack for the tick)
  expect(Math.abs(secs(after) - secs(before))).toBeLessThanOrEqual(3);
});
