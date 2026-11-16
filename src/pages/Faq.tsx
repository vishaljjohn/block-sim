import type { ReactNode } from 'react';
import { BUG_REPORT_URL } from '../config';
import { H1 } from '../ui/Shell';
import { InstallHelp } from '../ui/InstallHelp';

const QA: { q: string; a: ReactNode }[] = [
  {
    q: 'My history is gone. What happened?',
    a: (
      <>
        <p>Block Sim keeps everything in this browser on this computer (and in your data folder, if you chose one). History disappears from the browser when its site data is cleared, in a private/incognito window, in a different browser or browser profile, or if the browser removes storage when the disk is nearly full.</p>
        <p>To get it back: if you had a data folder, open <b>Settings → Choose a data folder</b> and pick the same folder. Otherwise use <b>Settings → Restore from a backup file</b> with your most recent backup. Settings also keeps the last 5 automatic snapshots.</p>
        <p>To prevent it: choose a data folder (Chrome/Edge), install the app, and back up regularly.</p>
      </>
    ),
  },
  {
    q: 'How do I move to a new computer?',
    a: (
      <>
        <p><b>With a data folder in iCloud Drive, OneDrive, Dropbox or Google Drive:</b> open Block Sim on the new computer, choose <b>Choose a data folder</b>, and pick the same folder. Everything appears.</p>
        <p><b>Without one:</b> on the old computer click <b>Back up now</b>, copy the file to the new computer (cloud drive, USB stick, email), then <b>Settings → Restore from a backup file</b>.</p>
      </>
    ),
  },
  {
    q: 'The answer key is wrong or some answers are missing.',
    a: (
      <p>Open the exam and click <b>Edit answer key</b>. Type the right letter in the Answer column (warnings are highlighted; use <b>Jump to next warning</b>). If many are off, the page layout may be shifted: check the Pages column, or use <b>Read key from text or PDF…</b> and paste the key. Your past attempts are re-graded automatically with the corrected key.</p>
    ),
  },
  {
    q: 'I can’t click the choices on the page.',
    a: (
      <p>Block Sim only makes choices clickable when it can read them clearly; otherwise it shows the A–E bubble panel beside the question, which always works (you can also press the letter). If clickable choices are in the wrong place, choose <b>Settings (gear) → Choices look wrong? Use bubbles</b> in the test, or fix them under <b>Layout, crop and choices → Fix choices</b>. Scanned PDFs are read in the background, so choices can become clickable a minute after importing.</p>
    ),
  },
  {
    q: 'Importing is slow.',
    a: (
      <p>PDFs that are pictures of pages (scans and screenshots) have to be read with text recognition. This happens once per PDF on your computer and is saved; afterwards the exam opens instantly. Large PDFs can take a few minutes. You can click <b>Skip waiting</b>: the exam is usable right away with one page per question, and the rest finishes in the background. Chrome or Edge on a laptop is fastest.</p>
    ),
  },
  {
    q: 'How do I back up?',
    a: (
      <p>Best: <b>Settings → Choose a data folder</b> inside a cloud drive, so every change is saved there automatically. Otherwise click <b>Back up now</b> on the Library screen (and after finishing a block). The backup is one .zip file with every exam, PDF, attempt, note and highlight. Keep it somewhere other than this computer.</p>
    ),
  },
  {
    q: 'The question looks cut off or shows a toolbar.',
    a: (
      <p>Each page is trimmed automatically. If the trim is wrong, open the exam, choose <b>Layout, crop and choices → Crop for all pages</b> and drag a box around the question area, or pick “No crop”. For one question, adjust its area under <b>Question areas</b>.</p>
    ),
  },
  {
    q: 'What does the timer do if my laptop goes to sleep?',
    a: <p>The clock is computed from real timestamps. If the computer sleeps or the window is closed for more than a minute, the block pauses at the moment you left and shows <b>Resume block</b> when you come back. Your answers, highlights and notes are saved as you go.</p>,
  },
  {
    q: 'Keyboard shortcuts',
    a: <p>A–Z select a choice · ← / → or P / N previous/next · M mark · L lab values · C calculator · Esc close panels. When a shortcut letter is also a choice (for example C), hold Alt/Option with it. Right-click (or long-press on iPad) strikes out a choice.</p>,
  },
  {
    q: 'Is my data private?',
    a: <p>Yes. Block Sim is a static web page: there is no server, no account and no analytics. PDFs and history never leave your computer unless you copy a backup file somewhere yourself. Only import materials you have the right to use.</p>,
  },
];

export function Faq() {
  return (
    <div className="max-w-3xl" data-testid="faq">
      <H1>Help</H1>
      {QA.map((x, i) => (
        <details key={i} className="mb-2 border border-gray-400 p-2 text-sm" open={i === 0}>
          <summary className="cursor-pointer font-bold">{x.q}</summary>
          <div className="mt-2 space-y-2">{x.a}</div>
        </details>
      ))}
      <details className="mb-2 border border-gray-400 p-2 text-sm">
        <summary className="cursor-pointer font-bold">How do I install the app?</summary>
        <div className="mt-2">
          <InstallHelp />
        </div>
      </details>
      <p className="mt-4 text-sm">
        Still stuck? <a className="link" href={BUG_REPORT_URL} target="_blank" rel="noreferrer noopener">Report a bug</a> and attach the file from <b>Settings → Export debug info</b> (it never contains questions or PDFs).
      </p>
    </div>
  );
}
