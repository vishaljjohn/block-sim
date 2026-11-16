# Block Sim

Free practice-exam app for medical students. Load **any** question PDF and its answer key, then take it in a
board-style test screen. Every attempt is saved, so you can come back weeks or months later and review what you
missed.

- **Open it:** https://vishaljjohn.github.io/block-sim/
- Works best in **Chrome or Edge on a laptop**. Also works in Safari and on iPad (touch).
- Nothing you load ever leaves your computer. No accounts, no uploads, no tracking. It works offline once opened.

---

## For students

### 1. Open the link and install it
Open the link above in Chrome or Edge. The welcome screen walks you through three things.
To install: click the install icon at the right end of the address bar (a small monitor with an arrow), or
⋮ menu → **Install Block Sim** (Edge: **Apps → Install this site as an app**). On iPad: Share → **Add to Home Screen**.
Installed, Block Sim opens in its own window and works with no internet.

### 2. Pick a data folder (Chrome/Edge only, recommended)
On the welcome screen (or **Settings → Data folder**) choose **Choose a data folder** and make a new folder called
`Block Sim`, ideally inside iCloud Drive, OneDrive, Dropbox or Google Drive. Every exam and attempt is saved there
as its own file, so your history survives browser clean-ups and follows you to a new computer.
After a browser restart, Block Sim may ask you to click **Reconnect data folder** once: that's normal.

No folder (Safari, iPad, or you skipped it)? Your history lives in the browser. The Library shows
**"Last backup: X days ago"**; click **Back up now** every week or two and keep the file somewhere safe.

### 3. Import an exam
**Library → + Import a PDF exam**.
1. Choose the question PDF.
2. Layout: leave **Work it out for me** (it reads question numbers on the pages). If your PDF is exactly N pages
   per question, choose **Fixed** instead. You can also set the first question page and pages to skip.
3. Answer key: a separate PDF, the end of the same PDF, after each question, or **paste it**
   (`1 C, 2 A, 3 B…`, `1. C`, or one letter per line all work).
4. Click **Continue**.

Only import materials you have the right to use.

### 4. Check the answer key
You see a table: question number, answer, number of choices, pages, tags and explanation. Everything is editable.
Rows with a problem are red; **Jump to next warning** takes you through them. Click a row to see that question.
When it looks right, click **Key looks right: save**. You can come back any time (**Edit** in the Library); fixing
the key also re-grades your old attempts.

### 5. Take a block
**New attempt** → choose the questions (all, a range, random N, missed only, marked only, or by tag), the order and
the mode:
- **Exam**: timed (90 s per question by default), full screen, answers locked until the end.
- **Tutor**: submit each answer to see the correct answer and explanation right away.
- **Untimed**: like Exam without a clock.

Presets: 40 questions / 60 minutes, or shelf-style (110 questions in 4 blocks, 2 h 45 min, with break screens).

In the block:
- **Answer**: click the choice on the page (or the bubble beside it), or press its letter.
- **Highlight**: drag across text. Click a highlight to remove it.
- **Strike out**: right-click a choice (long-press on iPad).
- **Mark**: the checkbox above the question, or **M**.
- **Lab Values** (L), **Calculator** (C), **Notes**: top right. Esc closes them.
- **← / →** or **P / N**: previous / next. If a shortcut letter is also a choice, hold **Alt/Option** with it.
- **Pause** hides the question and stops the clock. If your computer sleeps or you close the window, the clock
  stops at that moment and **Resume block** brings you back exactly where you were.
- **End Block** shows a grid of answered / unanswered / marked questions with **Review Marked** and
  **Review Incomplete** before you confirm.

### 6. Review
After a block you get a score report (percent, time, answer changes, accuracy by confidence, time per question,
score by tag). **Review** opens the same test screen read-only, with your highlights, strike-outs and notes as you
left them, your answer in red/green, and the explanation on the right. Filter by incorrect, marked, changed
answers, guesses or slowest 10. For each miss, click a **reason** and write a **review note**.
Every attempt stays in the exam's history with a score trend chart.

### 7. Missed Questions
**Missed Questions** collects every question you got wrong, guessed or marked, across all exams. Filter it, click a
row to see the question with your original markings, or **Redo** it blind. Redos follow a spaced schedule
(3, 7, 21, 60 days); two correct redos on different days mark it **Mastered**. When questions are due, the Library
shows a **Due for review** card. **Quiz me** builds a block from whatever the list is filtered to.
**Weak Areas** shows accuracy by tag and by reason for miss, worst first.

### 8. Back up
- With a data folder: nothing to do (and put the folder in a cloud drive for an off-computer copy).
- Without: **Back up now** (Library, after each block, or Settings). Restore with **Settings → Restore from a backup
  file**. Restoring merges; it never deletes anything.

### 9. Move to a new computer
- With a data folder in a cloud drive: open Block Sim on the new computer, **Choose a data folder**, pick the same
  folder. Everything appears.
- Otherwise: **Back up now** on the old computer, copy the file over, **Settings → Restore** on the new one.

Problems? See **Help** in the app, or use the **Report a bug** link at the bottom of every page
(Settings → **Export debug info** gives a file to attach; it never contains questions or PDFs).

---

## For the maintainer

Stack: Vite + React + TypeScript + Tailwind, Dexie (IndexedDB), pdf.js and Tesseract.js bundled locally.
Hosted on GitHub Pages; `main` → `/block-sim/` (stable), `beta` → `/block-sim/beta/` (labeled BETA, separate
storage, separate service worker). Rules for working on the code are in `CLAUDE.md`; design choices in `DECISIONS.md`.

```bash
npm install
npm run dev          # http://localhost:5173/block-sim/
npm run fixtures     # make the test PDFs
npm test             # unit tests
npm run build && npm run e2e   # end-to-end tests (Chromium, WebKit, iPad)
```

### Ship a change to beta
```bash
git checkout beta
git merge main        # if beta is behind
# …make the change, run the checks above…
git push origin beta  # GitHub Actions tests and publishes /block-sim/beta/
```

### Promote beta to stable
```bash
git checkout main
git merge --ff-only beta
npm version patch     # bumps package.json and creates tag vX.Y.Z
git push origin main --follow-tags
```

### Roll back stable to the previous release (one command)
```bash
git checkout main && git reset --hard "$(git describe --tags --abbrev=0 HEAD^)" && git push --force-with-lease origin main
```
This moves `main` back to the previous tag; the workflow rebuilds and republishes it within a few minutes.
Users see an "Update available" banner and get the old version when they press Refresh. A rollback never changes
or deletes user data. If the release being rolled back raised the database version (`DB_VERSION` in `src/db.ts`,
which is called out in its release notes), the older app cannot open the newer database and asks the user to
update instead; roll back only to a tag with the same `DB_VERSION`.

### Test against the live site
```bash
BASE_URL=https://vishaljjohn.github.io/block-sim/ npx playwright test
```

### Local-only tests with private PDFs
Put PDFs in `/private-test` (git-ignored, never committed) and run `npm run private-test`.
