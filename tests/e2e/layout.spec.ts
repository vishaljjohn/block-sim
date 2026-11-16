import { expect, test } from '@playwright/test';
import { answers, freshStart, importExam } from './helpers';

test('layout editor: crop for all pages and fix choices by drawing boxes', async ({ page }, info) => {
  test.skip(info.project.name === 'ipad', 'drawing boxes is a mouse task');
  await freshStart(page);
  await importExam(page, { file: 'd-two-column.pdf', name: 'Layout', key: { paste: answers.d.join(' ') }, layout: 'fixed', perQuestion: 1 });
  await page.getByText('Fix page layout, crop and choices…').click();
  await expect(page.getByTestId('layout-editor')).toBeVisible();

  // crop: drag a box on the page, it applies to every page
  await page.getByTestId('tool-crop').click();
  const pg = page.locator('[data-page="1"]').first();
  await expect(pg).toHaveAttribute('data-drawn', '1');
  const b = (await pg.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.02, b.y + b.height * 0.03);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.6, { steps: 6 });
  await page.mouse.up();
  const crop = (await page.getByTestId('crop-box').boundingBox())!;
  expect(crop.width).toBeLessThan(b.width * 0.6);

  // choices: clear and draw two boxes by hand → A and B
  await page.getByTestId('tool-choices').click();
  await page.getByTestId('clear-choices').click();
  const p2 = page.locator('[data-page="1"]').first();
  const c = (await p2.boundingBox())!;
  for (const y of [0.4, 0.45]) {
    await page.mouse.move(c.x + c.width * 0.08, c.y + c.height * y);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width * 0.4, c.y + c.height * (y + 0.03), { steps: 4 });
    await page.mouse.up();
  }
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-q-1')).toContainText('2ch');
});
