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
- One GitHub Actions workflow builds both branches on every push and publishes a single Pages artifact
  (`main` at the root, `beta` under `/beta/`), so a push to one channel never removes the other.
