# Block Sim: plan and status

## STATUS (usage limit reached, 2026-11-16 ~12:00)

Live: stable https://www.vishaljohn.com/block-sim/ · beta https://www.vishaljohn.com/block-sim/beta/
(beta deploy was blocked by the Pages environment until it was allowed; the next CI run publishes it).

Done: Stages A–E built, committed, pushed (main + beta). Unit tests (79) and e2e (Chromium/WebKit/iPad) pass.
Last commit adds private-PDF fixes; the newest local edits (radio "Q", mangled radio glyphs, one missing
label, mean OCR confidence, in-order key reading) are committed by the final step below.

In progress: `npm run private-test` running in the background → /private-results/*.json (local only, ignored).
Results so far: text-layer exams 49–50/50 answers + choices; scanned exams 30–50/50 choices.

Next steps, in order
1. When the private run ends: `npm run build`, rerun failed/weak IDs with `ONLY=… REDO=1 npm run private-test`
   (1-6 highlight key 34/50; 1-9, 1-10, 6-1 keys; 1-1/1-2 scanned choices), summarize numbers.
2. Full checks: `npm run lint && npm test && npm run build:all && npx playwright test`.
3. Fresh subagent: first-time student following README on the beta URL; fix everything it reports.
4. Tag `v1.0.0` on main, push tags; final report (URLs, private numbers, 5-line checklist, known
   problems, classmate text, HTML card).

## Decisions made so far (move to DECISIONS.md)
- Test screen follows the reference screenshots: "Question Status" striped strip on the left; navy top bar with
  Item/Block box, centered Previous / n of m / Next, and Lab Values, Notes, Calculator, Settings on the right;
  bottom bar with the block timer (click toggles elapsed), Pause, Review, End Block. Mark checkbox with red flag
  sits above the question.
- Bubble answer box is styled like the reference choice box and sits beside the page.
- Keyboard: a letter that is a choice on the current question selects it; Alt+letter forces the shortcut (N/P/M/L/C).
- Lab values in `src/data/labValues.ts`: standard adult ranges with conventional and SI columns, tabs
  Serum / Cerebrospinal / Blood / Urine and BMI.
- Backups are zip files using the same file layout planned for the data folder.
- Demo PDF and vendor files are generated at build time (`scripts/prepare-assets.mjs`), never committed.
- Answer key is copied into each attempt item when graded; editing the key re-grades history.
- Service worker is hand-written (`src/sw.template.js`); stable ignores `/block-sim/beta/`.

## Findings on /private-test (121 PDFs, local only)
- Many question PDFs have a real text layer; many are image-only (need OCR, Stage D).
- Several have more pages than questions (questions span 2 pages) → auto page mapping by question number needed.
- Answer PDFs are mostly "question + Correct Answer: X + explanation" pages; some are text keys; some image-only.

## Stage checklist
- [ ] **Stage A** core
  - [x] project scaffold, config, channel-aware names
  - [x] types, Dexie schema v2 + migrations
  - [x] key parser, text lines, timer, schedule, score, missed bank, merge, highlights (+ unit tests)
  - [x] pdf.js loading/render cache, store, backup/restore, tab guard, error log, snapshots
  - [x] test/review screen, question view, bubbles, lab values, calculator, notes
  - [x] pages: Home, Import, Key check, Exam detail, Block setup, Score report, Settings
  - [ ] first build + browser check
  - [ ] fixtures, Playwright e2e, deploy
- [ ] **Stage B** missed bank page, redo page, quiz-me (logic in `src/lib/missed.ts`, `schedule.ts` is done; pages are placeholders)
- [ ] **Stage C** folder storage (`src/lib/folder.ts` is a stub with the final API)
- [ ] **Stage D** OCR, text layer, word-snap highlight (UI supports it already), choice detection, auto-crop,
      question splitting, layout editor (`src/lib/analyze.ts` is a stub; `LayoutEditor.tsx` placeholder)
- [ ] **Stage E** weak areas, welcome/onboarding, FAQ, PWA install prompt, beta channel
- [ ] private-test numbers, first-time-user subagent pass, README, final report
