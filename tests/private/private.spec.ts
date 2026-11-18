/**
 * LOCAL ONLY. Imports every question PDF in /private-test with its answer key through the real UI and records
 * numbers (questions, answers, explanations, clickable choices, crops). Writes /private-results/*.json.
 * Never prints or saves question content.
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('private-test');
const OUT = path.resolve('private-results');
fs.mkdirSync(OUT, { recursive: true });

interface Pair {
  id: string;
  q: string;
  a: string | null;
}
function pairs(): Pair[] {
  if (!fs.existsSync(ROOT)) return [];
  const out: Pair[] = [];
  for (const d of fs.readdirSync(ROOT).filter((x) => !x.startsWith('.') && fs.statSync(path.join(ROOT, x)).isDirectory()).sort()) {
    const files = fs.readdirSync(path.join(ROOT, d));
    for (const f of files) {
      const m = /^(\d+)\s*Q\.pdf$/i.exec(f);
      if (!m) continue;
      const a = files.find((x) => new RegExp(`^${m[1]}\\s*A\\.pdf$`, 'i').test(x));
      out.push({ id: `${d.split(' ')[0]}-${m[1]}`, q: path.join(ROOT, d, f), a: a ? path.join(ROOT, d, a) : null });
    }
  }
  const only = process.env.ONLY?.split(',');
  return only ? out.filter((p) => only.includes(p.id)) : out;
}

for (const p of pairs()) {
  test(`private ${p.id}`, async ({ page }) => {
    const resFile = path.join(OUT, `${p.id}.json`);
    if (fs.existsSync(resFile) && !process.env.REDO) test.skip();
    const t0 = Date.now();
    // a same-origin page that does not open the database, so it can really be deleted
    await page.goto('./vendor/pdfjs/iccs/LICENSE');
    await page.evaluate(async () => {
      localStorage.clear();
      for (const n of ['blocksim', 'blocksim-beta']) await new Promise((r) => { const q = indexedDB.deleteDatabase(n); q.onsuccess = q.onerror = () => r(null); });
    });
    await page.goto('./#/import');
    await page.getByTestId('question-file').setInputFiles(p.q);
    await expect(page.getByTestId('pdf-info')).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('layout-auto').check();
    if (p.a) {
      await page.getByTestId('src-pdf').check();
      await page.getByTestId('key-file').setInputFiles(p.a);
    } else await page.getByTestId('src-none').check();
    await page.getByTestId('import-go').click();
    await expect(page.getByTestId('key-check')).toBeVisible({ timeout: 40 * 60_000 });
    const found = Number(new URL(page.url().replace('#', '')).searchParams.get('found') ?? '0');
    const stats = await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('blocksim'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const all = <T,>(s: string): Promise<T[]> => new Promise((res) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result as T[]); });
      const exams = (await all<any>('exams')).filter((x) => !x.isDemo);
      const e = exams[0];
      const pages = (await all<any>('pages')).filter((x) => x.examId === e.id);
      const qs = e.questions as any[];
      const qPages = new Set(qs.flatMap((q) => q.segments.map((s: any) => s.page)));
      const pt = pages.filter((x) => qPages.has(x.page));
      const cropped = pt.filter((x) => x.autoCrop && (x.autoCrop.h < 0.97 || x.autoCrop.w < 0.97));
      // choices must sit inside the visible area
      const choicesInside = qs.filter((q) => q.choices?.length).every((q) => q.choices.every((c: any) => {
        const seg = q.segments.find((s: any) => s.page === c.page);
        const r = seg?.rect ?? pages.find((x) => x.page === c.page)?.autoCrop ?? { x: 0, y: 0, w: 1, h: 1 };
        return c.y >= r.y - 0.01 && c.y + c.h <= r.y + r.h + 0.02;
      }));
      return {
        pageCount: e.pageCount,
        questions: qs.length,
        multiPageQuestions: qs.filter((q) => q.segments.length > 1).length,
        splitRegions: qs.filter((q) => q.segments.some((s: any) => s.rect)).length,
        withAnswer: qs.filter((q) => q.answer).length,
        withExplanation: qs.filter((q) => (q.explanation ?? '').trim().length > 20).length,
        withChoices: qs.filter((q) => (q.choices?.length ?? 0) >= 2).length,
        answerBeyondChoices: qs.filter((q) => q.answer && q.choices?.length && q.answer.charCodeAt(0) - 65 >= q.choices.length).length,
        ocrPages: pt.filter((x) => x.source === 'ocr').length,
        textPages: pt.filter((x) => x.source === 'pdf').length,
        pagesCropped: cropped.length,
        pagesProcessed: pt.length,
        meanCropArea: pt.length ? pt.reduce((s, x) => s + (x.autoCrop ? x.autoCrop.w * x.autoCrop.h : 1), 0) / pt.length : 1,
        choicesInside,
        meanOcrConf: pt.filter((x) => x.source === 'ocr').reduce((s, x, _, arr) => s + x.conf / arr.length, 0),
        // structure only (no text): page → words, crop; question → pages
        debug: {
          pages: pages.sort((a, b) => a.page - b.page).map((x) => `${x.page}:${x.source}:${x.words.length}w:${x.autoCrop ? [x.autoCrop.x, x.autoCrop.y, x.autoCrop.w, x.autoCrop.h].map((v: number) => v.toFixed(2)).join('/') : 'none'}`),
          questions: qs.map((q) => `${q.number}:${q.segments.map((s: any) => s.page + (s.rect ? '*' : '')).join('+')}:${q.choices?.length ?? 0}ch:${q.answer || '-'}`),
          // geometry only, for the picture-coverage check (scripts outside the repo render the pages and compare)
          areas: qs.map((q) => ({ n: q.number, segs: q.segments.map((s: any) => ({ page: s.page, rect: s.rect ?? null })) })),
          crops: Object.fromEntries(pages.map((x) => [x.page, x.autoCrop ?? null])),
          examCrop: e.crop ?? null,
          examAutoCrop: e.autoCrop !== false,
        },
      };
    });
    if (process.env.DUMP) {
      // local debugging only: the start of each line on a few pages
      const dump = await page.evaluate(async (want: number[]) => {
        const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('blocksim'); r.onsuccess = () => res(r.result); });
        const all: any[] = await new Promise((res) => { const r = db.transaction('pages').objectStore('pages').getAll(); r.onsuccess = () => res(r.result); });
        return all.filter((x) => want.includes(x.page) && x.examId !== 'demo-exam').map((x) => ({ page: x.page, words: x.words, autoCrop: x.autoCrop }));
      }, process.env.DUMP.split(',').map(Number));
      fs.writeFileSync(path.join(OUT, `${p.id}-dump.json`), JSON.stringify(dump, null, 1));
    }
    const res = { id: p.id, hasKey: !!p.a, keyAnswersRead: found, seconds: Math.round((Date.now() - t0) / 1000), ...stats };
    fs.writeFileSync(resFile, JSON.stringify(res, null, 1));
    // a few crop previews for a visual check (kept locally in /private-results, never committed)
    await page.screenshot({ path: path.join(OUT, `${p.id}-keycheck.png`) });
  });
}
