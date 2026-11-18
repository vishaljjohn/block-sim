import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { freshStart, pick, startBlock } from './helpers';

test('a finished test exports to a PDF with the chosen parts', async ({ page }, info) => {
  test.skip(info.project.name === 'ipad', 'downloads');
  await freshStart(page);
  await page.goto('./#/exam/demo-exam');
  await startBlock(page, { mode: 'untimed' });
  await pick(page, 'B');
  await page.getByTestId('strike-C').click();
  await page.getByTestId('end-block').click();
  await page.getByTestId('grid-end').click();
  await page.getByTestId('confirm-end').click();
  await page.getByTestId('report-pdf').click();
  await expect(page.getByTestId('pdf-dialog')).toBeVisible();
  await page.getByTestId('pdf-which-incorrect').check();
  const dl = page.waitForEvent('download');
  await page.getByTestId('pdf-go').click();
  const file = await (await dl).path();
  const bytes = fs.readFileSync(file!);
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  if (process.env.PDFCOPY) fs.writeFileSync(process.env.PDFCOPY, bytes);
  const pdf = await PDFDocument.load(bytes);
  // 4 incorrect/omitted questions, each with its page picture
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('pdf-dialog')).toHaveCount(0);
});
