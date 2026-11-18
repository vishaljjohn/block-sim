import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { freshStart } from './helpers';

/** A made-up folder: two "books" of text notes, and a section of (placeholder) videos. */
function makeFolder(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-lib-'));
  const w = (p: string, s: string) => {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), s);
  };
  w('My Notes Book/Chapter 1/01 Basics.txt', 'Sample note: water boils at 100 degrees at sea level.');
  w('My Notes Book/Chapter 1/02 More.txt', 'Second sample note.');
  w('Second Book/Overview.md', '# Overview\nMade-up text.');
  w('Lectures/Week 1/01 Welcome.mp4', 'not a real video');
  w('Lectures/Week 1/02 Next.mp4', 'not a real video');
  return root;
}

test('library and video library read a local folder', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'folder upload');
  const dir = makeFolder();
  await freshStart(page);
  await page.goto('./#/library');
  await page.getByTestId('library-input').setInputFiles(dir);
  await expect(page.getByTestId('book')).toHaveCount(2);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '/lib1.png' });
  await page.getByRole('button', { name: 'My Notes Book Open Book' }).click();
  await expect(page.getByTestId('library-book')).toContainText('Total Documents');
  await page.getByText('Chapter 1').first().click();
  await page.getByRole('link', { name: 'Basics' }).click();
  await expect(page.getByTestId('library-doc')).toContainText('water boils');
  await page.getByTestId('mark-done').click();
  await expect(page.getByTestId('mark-done')).toContainText('Done');
  await page.getByTestId('bookmark').click();
  await page.goto('./#/library?b=' + encodeURIComponent('My Notes Book'));
  await expect(page.getByTestId('continue-reading')).toBeVisible();
  await expect(page.getByText('50%')).toBeVisible();
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '/lib2.png' });

  await page.goto('./#/videos');
  await page.getByTestId('videos-input').setInputFiles(dir);
  await expect(page.getByTestId('videos-page')).toContainText('Total Videos');
  await page.getByRole('button', { name: 'Lectures' }).click();
  await page.goto('./#/videos?f=' + encodeURIComponent('Lectures/Week 1'));
  await expect(page.getByTestId('video-folder')).toContainText('2 videos');
  await page.getByText('Welcome').first().click();
  await expect(page.getByTestId('video-player')).toBeVisible();
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + '/vid.png' });
  await page.getByTestId('mark-watched').click();
  await expect(page.getByTestId('mark-watched')).toContainText('Watched');
});
