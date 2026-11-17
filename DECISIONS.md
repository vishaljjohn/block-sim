# Decisions

Reasonable choices made without asking, with the reason.

## Interface
- **Layout follows the reference screenshots**: a striped "Question Status" list on the left (dot = unanswered,
  flag = marked, ✓/✗ in review); a navy top bar with an "Item: n of m / Block: x of y" box, centered
  Previous · n / m · Next, and Lab Values · Notes · Calculator · Settings on the right; a navy bottom bar with the
  block clock on the left (click toggles remaining/elapsed), Pause in the middle and Review · End Block on the right.
  "Mark Question" (checkbox + red flag) sits above the question, like the reference.
- The spec asked for every tool in the bottom bar; the reference puts Lab Values/Notes/Calculator at the top.
  The reference wins (the spec says to match /reference where provided).
- Lab values come from `src/data/labValues.ts`, with the same four tabs as the reference (Serum, Cerebrospinal,
  Blood, Urine and BMI), a search box that searches all tabs, and an "SI Reference Intervals" toggle.
- Calculator copies the reference's layout (M+, MR, MC, C, ±, √, 1/x, operators) and also takes keyboard input.
- Keyboard letters: if a letter is an answer choice on the current question it selects that choice (spec: A–Z
  select); otherwise it is the shortcut (N, P, M, L, C). Alt+letter always means the shortcut, so a question
  with choices up to N can still use shortcuts.
- Explanations in review/tutor are shown in a side panel to the right of the question, like the second reference set.
- The question is always the original page image. When choices are detected (Stage D) they become clickable on
  the page and the bubble panel hides; "Choices look wrong? Use bubbles" in Settings brings bubbles back.

## Storage
- IndexedDB via Dexie is the working store; a synchronous localStorage copy of the open attempt is written on
  every change so a refresh/crash in the middle of an IndexedDB write loses nothing.
- Backups are .zip files containing exactly the data-folder layout (one JSON per exam, one per attempt, PDFs as
  files). Restore merges by ID and never deletes; deletions are tracked as tombstones in `deleted.json`.
- When an exam is deleted the user chooses whether to keep its attempt history; the answer key is copied into
  every graded attempt item so old score reports stay correct even without the exam.
- Editing the answer key re-grades past attempts (a wrong key should not leave wrong scores behind).

## Import
- Default layout is "work it out": question numbers are read from the page text/OCR; if that fails it falls back to
  one page per question. A fixed "N pages per question" mode is always available.
- Answers in the key are matched by question number; when the key starts at another number (e.g. 51) it is aligned
  to question 1.

## Release
- One GitHub Actions workflow tests and builds `main` on every push and publishes it to GitHub Pages.

## Later additions
- **Display settings** (gear in the test screen, and Settings → Display) follow the owner's screenshot: Appearance
  light/dark, Typography size S/M/L/XL and Bold, Layout style, Highlighting Quick/Manual with five colors. The second
  layout is called "Board-style" (not a trademarked exam name). "Default" is a cleaner slate look with rounded
  controls and the system font; "Board-style" is the navy look from the reference screenshots (the default setting).
- **Dark mode** inverts the page's lightness while keeping hues (one CSS filter), so the PDF page images also turn
  dark-on-light → light-on-dark; the navy bars and zoomed pictures are flipped back so they keep their real colors.
- **Text size** scales the question image and the interface text. **Bold** thickens dark strokes in the page image
  (an SVG morphology filter) and bolds interface text.
- **Manual highlighting**: drag selects, a small palette appears next to it, the chosen color is applied. Highlights
  of different colors never merge; old highlights (before colors existed) are yellow.
- **Strike-out**: an "ab" button to the right of every choice on the page (also right-click / long-press).
- **Image zoom**: pictures inside a question (photos, ECGs, x-rays) are found from the page pixels (dense non-text
  areas) and get a Zoom button; the viewer renders only that area, so it stays sharp at 500%.
- **Restore** brings back exams/attempts deleted after the backup was made (the user chose that backup), while
  folder sync still honors deletions made on other computers.
- **Answer keys that only highlight the answer** are read from the page pixels (yellow/green behind a choice).
- **Layout hint**: the key's highest question number tells how many questions to expect; when page text is
  ambiguous, the layout (detected vs. N whole pages per question) closest to that count is used.
- **Clock** ticks from a tiny worker so background tabs (throttled to ~1/min) are not mistaken for sleep.
- **Release flow**: one channel. The beta channel was retired (Nov 2026): its link now redirects to the app and
  replaces the old beta service worker; on first open the app merges the beta database (`blocksim-beta`) into its
  own by ID, like a backup restore, and leaves the old storage untouched.

### Pictures are never trimmed away (page version 3)
- The automatic trim tells toolbars from pictures by shape, not by file: a toolbar row is almost all one color with
  little white; a dark picture sits on white. Runs of "bar" rows taller than 10% (16% at an edge) and runs of bar
  columns wider than 6% (20% at an edge) are pictures. After trimming, any picture-sized gray content left outside
  is pulled back in.
- Question areas: labels inside a picture above a question (ECG leads, "R"/"L") do not make that picture part of the
  previous question; pages with only a picture continue the current question; a picture beside the text widens the
  question area unless that would reach into another question beside it.
- Older imports are re-checked in the background (page version 3). Trims and areas only ever grow, so nothing that
  was visible disappears.
- Checked locally against every private PDF with an independent renderer that reports any gray/dark content no
  question shows (script kept outside the repo, since it reads private files).

### Questions from Word, text or pasted text
- Turned into an exam PDF in the browser (pdf-lib + bundled Liberation Sans for Unicode; mammoth for .docx), so
  the whole PDF pipeline (layout, choices, highlighting, inline "Answer: C" keys) applies unchanged. Each numbered
  question starts a page, together with any pictures directly above it. Nothing is uploaded.

### Always the newest version, no update banner
- Pages (navigations) are network-first with a 5-second fallback to the saved copy, so opening the app online
  always shows the latest release; hashed files are cache-first. A new service worker takes over at once
  (`skipWaiting`) but never reloads a page; the previous version's cache is kept so a page still open from before
  can finish loading its files. The "Update available / Refresh" banner was removed.
