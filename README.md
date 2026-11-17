# Test Simulator

Free practice-exam app for medical students. Load **any** question PDF and its answer key, then take it in a
board-style test screen. Every attempt is saved, so you can come back weeks or months later and review what you
missed.

- **Open it:** https://www.vishaljohn.com/block-sim/
- **Try new features first (beta):** https://www.vishaljohn.com/block-sim/beta/ (its own separate history)
- Works best in **Chrome or Edge on a laptop**. Also works in Safari and on iPad (touch).
- Nothing you load ever leaves your computer. No accounts, no uploads, no tracking. It works offline once opened.

---

## For students

### 1. Open the link and install it
Open the link above in Chrome or Edge. The welcome screen walks you through three things.
To install: click the install icon at the right end of the address bar (a small monitor with an arrow), or
⋮ menu → **Install Test Simulator** (Edge: **Apps → Install this site as an app**). On iPad: Share → **Add to Home Screen**.
Installed, Test Simulator opens in its own window and works with no internet.

### 2. Pick a data folder (Chrome/Edge only, recommended)
On the welcome screen (or **Settings → Data folder**) choose **Choose a data folder** and make a new folder called
`Test Simulator`, ideally inside iCloud Drive, OneDrive, Dropbox or Google Drive. Every exam and attempt is saved there
as its own file, so your history survives browser clean-ups and follows you to a new computer.
After a browser restart, Test Simulator may ask you to click **Reconnect data folder** once: that's normal.

No folder (Safari, iPad, or you skipped it)? Your history lives in the browser. The Library shows
**"Last backup: X days ago"**; click **Back up now** every week or two and keep the file somewhere safe.

### 3. Import an exam
**Library → + Import a PDF exam**.
1. Choose the questions: a **PDF**, a **Word or text file** (.docx, .txt), or **Paste text**. Word and text
   questions are turned into exam pages on your computer; number the questions (1., 2.) and letter the choices
   (A), B)). An `Answer: C` line after a question is used as its answer, with any text after it as the explanation.
2. Layout: leave **Work it out for me** (it reads question numbers on the pages). If your PDF is exactly N pages
   per question, choose **Fixed** instead. You can also set the first question page and pages to skip.
3. Answer key: a separate PDF; the end of the same PDF (type the page where the key starts); after each question
   (hidden while you take the exam); **paste it** (`1 C, 2 A, 3 B…`, `1. C`, or one letter per line all work); or
   no key yet (type the answers on the next screen). Keys that mark the answer only with a highlight work too.
4. Optional: pick a **Folder** (Surgery, OBGYN, Internal Medicine…) or choose **New folder…** and type a name.
5. Click **Continue**.

**A whole folder at once:** **Import → A whole folder of exams**. Make one folder with a subfolder per subject, put
each exam's question PDF and answer PDF in its subject folder named so they match (`5 Q.pdf` + `5A.pdf`), and pick
the top folder. Every pair is imported and each subfolder becomes a Library folder. In Chrome/Edge, tick
**Keep my Test Simulator data in this folder**: the app then saves its data in a `Test Simulator Data` subfolder next
to your PDFs and reads the PDFs from where they are instead of copying them.

Only import materials you have the right to use.

### 4. Check the answer key
You see a table: question number, answer, number of choices, pages and explanation. Everything is editable.
Rows with a problem are red; **Jump to next warning** takes you through them. Click a row to see that question.
When it looks right, click **Key looks right: save** (you land on the exam's page, with **New attempt**). You can come back any time (**Edit** in the Library); fixing
the key also re-grades your old attempts.

### 5. Take a block
**New attempt** → choose the questions (all, a range, random N, missed only or marked only), the order, and two
independent choices:
- **Test mode** (answers and explanations at the end, like the real exam) or **Tutor mode** (answer and explanation
  after each question).
- **Timed** (90 s per question by default; Test + Timed opens full screen) or **Untimed**.

Presets: 40 questions / 60 minutes, or shelf-style (110 questions in 4 blocks, 2 h 45 min, with break screens).

In the block:
- **Answer**: click the choice on the page (or the bubble beside it), or press its letter.
- **Highlight**: drag across text (as little as one character) or double-click a word. Click a highlight to remove
  it. Answer choices are never highlighted: strike them out instead.
- **Mark**: the checkbox above the question, or **M**.
- **Pictures** (photos, ECGs, x-rays): click the picture or its **Zoom** button to pop it out; use − / + (or the − and + keys) to zoom, drag the title bar to move it.
- **Lab Values** (L), **Calculator** (C), **Notes**: top right. Esc closes them.
- **← / →** or **P / N**: previous / next. Letters pick answer choices first (on a question with choices A–E, **C** picks choice C); to use a shortcut whose letter is also a choice, hold **Alt/Option** (Alt+C opens the Calculator).
- **Clock** (bottom, shows the current mode): click it to switch Test / Tutor and Timed / Untimed, add or take away
  5–30 minutes, or type any number of minutes (+7, -3). In Tutor, **Proceed to Next Item** appears under the choices.
- **Item box** (top left): click it to hide or show the question list. **Full Screen** sits next to Lab Values.
- **Lab Values** opens full height on the right; the search highlights matches, and **SI** adds a column.
- **Pause** hides the question and stops the clock. If your computer sleeps or you close the window, the clock
  stops at that moment and **Resume block** brings you back exactly where you were.
- **Review** (bottom right) shows a grid of answered / unanswered / marked questions with **Review Marked** and
  **Review Incomplete**; **End Block** shows the same grid and then asks you to confirm.
- **Settings** (gear, top right, only during a block): light/dark, text size S–XL, bold, Default or Board-style look, and highlighting
  (**Quick**: dragging highlights at once; **Manual**: drag, then pick a color) with a default color.
- **Strike out** a choice with the **ab** button to its right (or right-click it; long-press on iPad).
  Strike-outs, highlights and notes are kept and shown again when you review the block.

### 6. Review
After a block you get a score report with two tabs: **Test Results** (score, every question with your answer,
the correct one and time; filter by correct / incorrect / omitted / marked) and **Test Analysis** (score ring, answer
changes, time per question). **Review** opens the same test screen read-only, with your highlights, strike-outs and notes as you
left them, your answer in red/green, and the explanation on the right. Filter by incorrect, marked, changed
answers or slowest 10. You can highlight inside explanations too; those highlights are kept. For each miss, click a **reason** and write a **review note**.
Every attempt stays in the exam's history with a score trend chart. An unfinished block you no longer want can be
discarded from the Library.

### 7. Missed Questions
**Missed Questions** collects every question you got wrong or marked, across all exams. Filter it, click a
row to see the question with your original markings, or **Redo** it blind. Redos follow a spaced schedule
(3, 7, 21, 60 days); two correct redos on different days mark it **Mastered**. When questions are due, the Library
shows a **Due for review** card. **Quiz me** builds a block from whatever the list is filtered to.

### 8. Back up
- With a data folder: nothing to do (and put the folder in a cloud drive for an off-computer copy).
- Without: **Back up now** (Library or after each block), or **Settings → Export everything**. Restore with
  **Settings → Restore from a backup file**. Restoring merges and never deletes anything; it also brings back exams
  you deleted after making that backup.

### Fix a question's area or choices
Open the exam → **Questions, pictures and choices**. Pick a question on the left. Green is what the question shows,
blue are the clickable choices. Untick **Question area locked** and drag around everything the question should show
(for example a picture above it); this changes only that page, or click **Use this area on every page**. Untick
**Answer choices locked** and drag a box around each choice in order (A, B, C…). Every change saves at once;
**Undo** / **Redo** (⌘Z / Ctrl+Z) take it back.

### 9. Move to a new computer
- With a data folder in a cloud drive: open Test Simulator on the new computer, **Choose a data folder**, pick the same
  folder. Everything appears.
- Otherwise: **Back up now** on the old computer, copy the file over, **Settings → Restore** on the new one.

Problems? See **Help** in the app, or use the **Report a bug** link at the bottom of every page
(Settings → **Export debug info** gives a file to attach; it never contains questions or PDFs).

---

## For the maintainer

Stack: Vite + React + TypeScript + Tailwind, Dexie (IndexedDB), pdf.js and Tesseract.js bundled locally.
The app was renamed from Block Sim to Test Simulator; the URL path (`/block-sim/`), the database names and the
backup format are unchanged on purpose so installed apps, links and everyone's history keep working.
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
BASE_URL=https://www.vishaljohn.com/block-sim/ npx playwright test
```

### Local-only tests with private PDFs
Put PDFs in `/private-test` (git-ignored, never committed) and run `npm run private-test`.
