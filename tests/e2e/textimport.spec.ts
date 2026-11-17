import { expect, test } from '@playwright/test';
import { fixture, freshStart, startBlock } from './helpers';

for (const [kind, file] of [
  ['text file', 'g-questions.txt'],
  ['Word file', 'g-questions.docx'],
] as const) {
  test(`questions from a ${kind}: numbered questions, clickable choices, answers from "Answer:" lines`, async ({ page }) => {
    await freshStart(page);
    await page.goto('./#/import');
    await page.getByTestId('qsrc-doc').click();
    await page.getByTestId('question-doc').setInputFiles(fixture(file));
    await expect(page.getByTestId('pdf-info')).toContainText('3 pages');
    await expect(page.getByTestId('src-inline')).toBeChecked();
    await page.getByTestId('import-go').click();
    await expect(page.getByTestId('key-check')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('key-check')).toContainText('3 questions');
    await expect(page.getByTestId('key-check')).toContainText('3 have an answer');
    if (kind === 'Word file') {
      // the picture above question 3 is part of question 3's page
      const res = await page.evaluate(async () => {
        const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open('blocksim'); q.onsuccess = () => r(q.result); });
        const all: any[] = await new Promise((r) => { const q = db.transaction('exams').objectStore('exams').getAll(); q.onsuccess = () => r(q.result); });
        const e = all.find((x) => !x.isDemo);
        return e.questions.map((q: any) => ({ a: q.answer, n: q.choices?.length ?? 0 }));
      });
      expect(res).toEqual([{ a: 'A', n: 4 }, { a: 'C', n: 3 }, { a: 'D', n: 5 }]);
      // and the picture is on question 3's page, ready to zoom in the test
      await page.getByTestId('save-close').or(page.getByRole('button', { name: 'Key looks right: save' })).first().click();
      await startBlock(page, { mode: 'untimed' });
      await expect(page.getByTestId('zoom-image')).toHaveCount(0);
      await page.getByTestId('next').click();
      await page.getByTestId('next').click();
      await expect(page.getByTestId('item-n')).toHaveText('3');
      await expect(page.getByTestId('zoom-image').first()).toBeVisible();
    }
  });
}

test('questions pasted as text', async ({ page }) => {
  await freshStart(page);
  await page.goto('./#/import');
  await page.getByTestId('qsrc-paste').click();
  await page.getByTestId('question-text').fill('1. An invented question?\nA) One\nB) Two\nAnswer: B\n\n2. Another made-up question?\nA) Yes\nB) No\nC) Maybe\nAnswer: C');
  await page.getByTestId('make-from-text').click();
  await expect(page.getByTestId('pdf-info')).toContainText('2 pages');
  await page.getByTestId('import-go').click();
  await expect(page.getByTestId('key-check')).toContainText('2 have an answer');
});

test('text without numbered questions explains what to do', async ({ page }) => {
  await freshStart(page);
  await page.goto('./#/import');
  await page.getByTestId('qsrc-paste').click();
  await page.getByTestId('question-text').fill('Some notes with no questions in them.');
  await page.getByTestId('make-from-text').click();
  await expect(page.getByTestId('import-error')).toContainText('no numbered questions');
  await expect(page.getByTestId('pdf-info')).toHaveCount(0);
});
