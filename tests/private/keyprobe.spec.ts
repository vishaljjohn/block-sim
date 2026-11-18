/** LOCAL ONLY (skipped unless KEYPROBE is set): run the app's own key reader in the browser (dev server) on one key PDF. */
import { test } from '@playwright/test';
import fs from 'node:fs';
test.skip(!process.env.KEYPROBE, 'local only');
test('key probe', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await page.route('**/__probe.pdf', (r) => r.fulfill({ body: fs.readFileSync(process.env.KEYPROBE!), contentType: 'application/pdf' }));
  await page.goto('./#/');
  const out = await page.evaluate(async () => {
    const base = '/block-sim/src/lib/';
    const { openPdf } = await import(/* @vite-ignore */ base + 'pdf.ts');
    const { readKeyFromPdf } = await import(/* @vite-ignore */ base + 'importer.ts');
    const { wordsProvider, highlightReader } = await import(/* @vite-ignore */ base + 'analyze.ts');
    const { pagesToKeyLines } = await import(/* @vite-ignore */ base + 'textLines.ts');
    const doc = await openPdf(await (await fetch('/block-sim/__probe.pdf')).arrayBuffer());
    const r0 = await readKeyFromPdf(doc, 1, doc.numPages, wordsProvider(null), undefined, highlightReader);
    const r = await readKeyFromPdf(doc, 1, doc.numPages, wordsProvider(null), undefined, highlightReader, wordsProvider(null, true));
    const prov = wordsProvider(null);
    const pages = [];
    for (let p = 1; p <= Math.min(doc.numPages, 12); p++) pages.push({ page: p, words: (await prov(doc, p)).words });
    const lines = pagesToKeyLines(pages).map((l: any) => `${l.page} ${l.text.slice(0, 70)}`);
    return { first: `${r0.key.format} ${r0.key.anchored} ${r0.key.entries.filter((e: any) => e.answer).length}`, format: r.key.format, anchored: r.key.anchored, entries: r.key.entries.map((e: any) => `${e.n}${e.answer || '-'}`).join(' '), lines };
  });
  fs.writeFileSync('private-results/keyprobe.json', JSON.stringify(out, null, 1));
});
