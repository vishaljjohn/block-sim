# Test Simulator: project rules

- 100% client-side static site. **No external requests at runtime**: no CDNs, analytics, fonts, APIs or keys.
  Every library (pdf.js + worker, Tesseract.js + English data) is bundled from node_modules by
  `scripts/prepare-assets.mjs`.
- **No real question content anywhere** in the repo, docs, tests or commits. The demo exam and test fixtures are
  original made-up questions (`scripts/demo-content.mjs`, `scripts/make-fixtures.mjs`).
- **Never commit `/private-test`** (or any `*.pdf`). It is in `.gitignore`; check `git status` before every commit.
  Never quote its content in code, docs, commit messages or reports.
- No exam-publisher or licensing-exam names, logos or trademarks in UI, code or docs: say "board-style".
- No feature for sharing exams or question content between users.
- Run before every commit: `npm run lint && npm test && npm run build && npm run e2e` (all must be green).
- One channel only: work on `main` and push; GitHub Pages publishes it to the live site (`/block-sim/`).
  No beta branch. Bump the version and tag every release (`npm version patch|minor` → `vX.Y.Z`).
- Every storage name comes from `src/config.ts` (`DB_NAME`, `STORAGE_PREFIX`, `TAB_CHANNEL`); never rename them
  (everyone's history lives there) and never hard-code one.
- Data safety: schema changes need a Dexie version bump + a pure migration function + a unit test
  (`tests/unit/core.test.ts`). Never drop or overwrite user data on update.
- When online, opening the app always loads the newest version (pages are network-first; the service worker
  only serves the saved copy offline). The service worker never reloads a page, so an open block is never interrupted.
