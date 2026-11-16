# Block Sim: plan and status

## STOPPED HERE (usage limit reached, 2026-11-16)

Nothing is committed, pushed or deployed yet. No GitHub repo exists yet.
`.gitignore` already excludes `/private-test`, all `*.pdf`, and generated assets.

State of the code:
- `npx vitest run`: 45 unit tests pass (key parser, timer/sleep, spaced schedule, merge, highlights, migrations, score, missed bank).
- `npx tsc --noEmit`: clean.
- `npx eslint src tests scripts --max-warnings 0`: 1 error + 6 warnings left
  - `src/lib/keyParser.ts:383` unused initial assignment (`let score = 0` → declare without value)
  - remove the unused `eslint-disable` line in the 6 placeholder pages
- `npm run build` has NOT been run yet. The app has never been opened in a browser.

### Next steps, in order
1. Fix the lint items above, run `npm run build`, open the app with `npm run dev`, fix whatever breaks.
2. Compare the test screen with `/reference/NBME Reference` and `/reference/Qbankly Reference` screenshots; adjust.
3. Write `scripts/make-fixtures.mjs` (test PDFs a–d) and Playwright e2e for Stage A.
4. Write CLAUDE.md, DECISIONS.md, README.md, `.github/workflows/deploy.yml`
   (build main → `dist/`, beta → `dist/beta/`, one Pages artifact).
5. First commit, `gh repo create block-sim --public`, enable Pages, deploy Stage A, run e2e on live URL.
6. Stages B–E below.

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
