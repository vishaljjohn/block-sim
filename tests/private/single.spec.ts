/**
 * LOCAL ONLY (skipped unless SINGLE is set to a PDF path): import one PDF whose answers and explanations follow
 * each question, and record numbers only (no question text) in /private-results/single.json.
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.skip(!process.env.SINGLE, 'local only');
test('single PDF with answers after each question', async ({ page }) => {
  test.setTimeout(60 * 60_000);
  await page.goto('./vendor/pdfjs/iccs/LICENSE');
  await page.evaluate(async () => {
    localStorage.clear();
    for (const n of ['blocksim', 'blocksim-beta']) await new Promise((r) => { const q = indexedDB.deleteDatabase(n); q.onsuccess = q.onerror = () => r(null); });
  });
  await page.goto('./#/import');
  await page.getByTestId('question-file').setInputFiles(path.resolve(process.env.SINGLE!));
  await expect(page.getByTestId('pdf-info')).toBeVisible({ timeout: 300_000 });
  await page.getByTestId('layout-auto').check();
  await page.getByTestId(process.env.KEYSRC ?? 'src-inline').check();
  const t0 = Date.now();
  await page.getByTestId('import-go').click();
  await expect(page.getByTestId('key-check')).toBeVisible({ timeout: 50 * 60_000 });
  const stats = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('blocksim'); r.onsuccess = () => res(r.result); });
    const all = <T,>(s: string): Promise<T[]> => new Promise((res) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result as T[]); });
    const e = (await all<any>('exams')).find((x) => !x.isDemo);
    const pages = (await all<any>('pages')).filter((x) => x.examId === e.id);
    const qs = e.questions as any[];
    return {
      pageCount: e.pageCount,
      questions: qs.length,
      numbers: qs.slice(0, 12).map((q) => q.number),
      withAnswer: qs.filter((q) => q.answer).length,
      withExplanation: qs.filter((q) => (q.explanation ?? '').trim().length > 40).length,
      meanExplLen: Math.round(qs.reduce((s, q) => s + (q.explanation ?? '').length, 0) / Math.max(1, qs.length)),
      withChoices: qs.filter((q) => (q.choices?.length ?? 0) >= 2).length,
      choiceCounts: qs.slice(0, 12).map((q) => q.choices?.length ?? 0),
      answers: qs.slice(0, 12).map((q) => q.answer || '-'),
      debug: {
        questions: qs.slice(0, 15).map((q) => `${q.number}:${q.segments.map((s: any) => s.page + (s.rect ? '[' + [s.rect.y, s.rect.h].map((v: number) => v.toFixed(2)).join(',') + ']' : '')).join('+')}`),
        areas: qs.map((q) => ({ n: q.number, segs: q.segments.map((s: any) => ({ page: s.page, rect: s.rect ?? null })) })),
        crops: Object.fromEntries(pages.map((x) => [x.page, x.autoCrop ?? null])),
        examCrop: e.crop ?? null,
        examAutoCrop: e.autoCrop !== false,
      },
    };
  });
  if (process.env.DUMP) {
    const dump = await page.evaluate(async (want: number[]) => {
      const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('blocksim'); r.onsuccess = () => res(r.result); });
      const all: any[] = await new Promise((res) => { const r = db.transaction('pages').objectStore('pages').getAll(); r.onsuccess = () => res(r.result); });
      return all.filter((x) => want.includes(x.page) && x.examId !== 'demo-exam').map((x) => ({ page: x.page, words: x.words, autoCrop: x.autoCrop }));
    }, process.env.DUMP.split(',').map(Number));
    fs.writeFileSync('private-results/single-dump.json', JSON.stringify(dump));
  }
  fs.mkdirSync('private-results', { recursive: true });
  fs.writeFileSync('private-results/single.json', JSON.stringify({ seconds: Math.round((Date.now() - t0) / 1000), ...stats }, null, 1));
  await page.screenshot({ path: 'private-results/single-keycheck.png' });
});
