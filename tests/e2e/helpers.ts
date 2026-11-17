import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const FIX = path.resolve(process.cwd(), 'tests/fixtures/generated');
export const fixture = (f: string) => path.join(FIX, f);
export const answers: Record<string, string[]> = JSON.parse(fs.readFileSync(path.join(FIX, 'answers.json'), 'utf8'));

/** Open the app with empty storage and skip the welcome screen. */
export async function freshStart(page: Page) {
  await page.goto('./');
  await page.evaluate(async () => {
    for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister();
    localStorage.clear();
    const dbs = (await indexedDB.databases?.()) ?? [{ name: 'blocksim' }, { name: 'blocksim-beta' }];
    await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name!); r.onsuccess = r.onerror = r.onblocked = () => res(null); })));
  });
  await page.goto('about:blank');
  await page.goto('./');
  await skipWelcome(page);
}

export async function skipWelcome(page: Page) {
  const skip = page.getByTestId('welcome-skip');
  try {
    await skip.waitFor({ timeout: 4000 });
    await skip.click();
  } catch {}
  await expect(page.getByTestId('home')).toBeVisible();
}

export async function importExam(page: Page, opts: { file: string; name: string; key?: { pdf?: string; paste?: string; inline?: boolean; samePage?: number }; layout?: 'auto' | 'fixed'; perQuestion?: number }) {
  await page.goto('./#/import');
  await page.getByTestId('question-file').setInputFiles(fixture(opts.file));
  await expect(page.getByTestId('pdf-info')).toBeVisible();
  await page.getByTestId('exam-name').fill(opts.name);
  if (opts.layout === 'fixed') {
    await page.getByTestId('layout-fixed').check();
    if (opts.perQuestion) await page.getByTestId('per-question').fill(String(opts.perQuestion));
  }
  if (opts.key?.pdf) {
    await page.getByTestId('src-pdf').check();
    await page.getByTestId('key-file').setInputFiles(fixture(opts.key.pdf));
  } else if (opts.key?.paste != null) {
    await page.getByTestId('src-paste').check();
    await page.getByTestId('key-paste').fill(opts.key.paste);
  } else if (opts.key?.inline) await page.getByTestId('src-inline').check();
  else if (opts.key?.samePage) {
    await page.getByTestId('src-same').check();
    await page.getByTestId('key-start').fill(String(opts.key.samePage));
  } else await page.getByTestId('src-none').check();
  await page.getByTestId('import-go').click();
  await expect(page.getByTestId('key-check')).toBeVisible({ timeout: 120_000 });
}

export async function confirmKey(page: Page) {
  await page.getByTestId('key-confirm').click();
  await expect(page.getByTestId('exam-detail')).toBeVisible();
}

export async function startBlock(page: Page, opts: { mode?: 'exam' | 'tutor' | 'untimed'; confidence?: boolean } = {}) {
  await page.getByTestId('detail-new-attempt').click();
  await expect(page.getByTestId('block-setup')).toBeVisible();
  await page.getByTestId(`mode-${opts.mode ?? 'exam'}`).check();
  if (opts.confidence) await page.getByTestId('opt-confidence').check();
  await page.getByTestId('start-block').click();
  await expect(page.getByTestId('test-screen')).toBeVisible();
  await expect(page.locator('[data-drawn="1"]').first()).toBeVisible();
}

export async function itemState(page: Page) {
  return page.evaluate(() => {
    const sel = [...document.querySelectorAll('[data-selected="1"]')].map((e) => e.getAttribute('data-testid'));
    const struck = [...document.querySelectorAll('[data-struck="1"]')].map((e) => e.getAttribute('data-testid'));
    return { sel, struck, highlights: document.querySelectorAll('[data-testid="highlight"]').length, marked: (document.querySelector('[data-testid="mark"]') as HTMLInputElement | null)?.checked ?? false };
  });
}

/** Select an answer: the clickable choice on the page when there is one, else the bubble. */
export async function pick(page: Page, letter: string) {
  const choice = page.getByTestId(`choice-${letter}`);
  const bubble = page.getByTestId(`bubble-${letter}`);
  // re-resolved on every retry: bubbles turn into clickable choices when background reading finishes
  await choice.or(bubble).first().click();
}
