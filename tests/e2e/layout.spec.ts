import { expect, test, type Page } from '@playwright/test';
import { answers, freshStart, importExam } from './helpers';

async function drag(page: Page, x0: number, y0: number, x1: number, y1: number) {
  const pg = page.getByTestId('layout-editor').locator('[data-page="1"]').first();
  await expect(pg).toHaveAttribute('data-drawn', '1');
  const b = (await pg.boundingBox())!;
  await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1, { steps: 6 });
  await page.mouse.up();
  return b;
}

test('layout editor: redraw the question area, draw choices, undo and redo', async ({ page }, info) => {
  test.skip(info.project.name === 'ipad', 'drawing boxes is a mouse task');
  await freshStart(page);
  await importExam(page, { file: 'd-two-column.pdf', name: 'Layout', key: { paste: answers.d.join(' ') }, layout: 'fixed', perQuestion: 1 });
  await page.getByText('Questions, pictures and choices…').click();
  await expect(page.getByTestId('layout-editor')).toBeVisible();
  await expect(page.getByTestId('undo')).toBeDisabled();

  // question area: locked until unticked, then a drag redraws it for this page only
  const before = (await page.getByTestId('area-box').boundingBox())!;
  await page.getByTestId('lock-area').uncheck();
  const b = await drag(page, 0.02, 0.03, 0.5, 0.6);
  await expect(page.getByTestId('layout-msg')).toHaveText('Question area changed.');
  const after = (await page.getByTestId('area-box').boundingBox())!;
  expect(after.width).toBeLessThan(b.width * 0.6);

  // undo puts it back, redo applies it again
  await page.getByTestId('undo').click();
  await expect.poll(async () => Math.round((await page.getByTestId('area-box').boundingBox())!.width)).toBe(Math.round(before.width));
  await page.getByTestId('redo').click();
  await expect.poll(async () => (await page.getByTestId('area-box').boundingBox())!.width).toBeLessThan(b.width * 0.6);
  await page.getByTestId('undo').click();

  // choices: untick the lock and draw two boxes → A and B
  await page.getByTestId('lock-choices').uncheck();
  await expect(page.getByTestId('lock-area')).toBeChecked();
  for (const y of [0.4, 0.45]) await drag(page, 0.08, y, 0.4, y + 0.03);
  await expect(page.getByTestId('layout-q-1')).toContainText('2 choices');
  await page.getByTestId('lock-choices').check();

  // kept after leaving and coming back
  await page.getByTestId('layout-done').click();
  await expect(page.getByTestId('exam-detail')).toBeVisible();
  await page.getByText('Questions, pictures and choices…').click();
  await expect(page.getByTestId('layout-q-1')).toContainText('2 choices');
});
