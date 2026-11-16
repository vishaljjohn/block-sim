# Block Sim: project rules

- 100% client-side static site. **No external requests at runtime**: no CDNs, analytics, fonts, APIs or keys.
  Every library (pdf.js + worker, Tesseract.js + English data) is bundled from node_modules by
  `scripts/prepare-assets.mjs`.
- **No real question content anywhere** in the repo, docs, tests or commits. The demo exam and test fixtures are
  original made-up questions (`scripts/demo-content.mjs`, `scripts/make-fixtures.mjs`).
- **Never commit `/private-test`** (or any `*.pdf`). It is in `.gitignore`; check `git status` before every commit.
  Never quote its content in code, docs, commit messages or reports.
- No NBME/USMLE names, logos or trademarks in UI, code or docs: say "board-style".
- No feature for sharing exams or question content between users.
- Run before every commit: `npm run lint && npm test && npm run build && npm run e2e` (all must be green).
- Ship to **beta first** (`beta` branch → `/block-sim/beta/`). Merge to `main` only when the owner says
  "promote to stable". Tag every stable release (`vX.Y.Z`).
- Beta and stable share one browser origin: every storage name comes from `src/config.ts` (`DB_NAME`,
  `STORAGE_PREFIX`, `TAB_CHANNEL`) and the service worker cache prefix includes the channel.
  Never hard-code a storage name.
- Data safety: schema changes need a Dexie version bump + a pure migration function + a unit test
  (`tests/unit/core.test.ts`). Never drop or overwrite user data on update.
- The service worker never reloads on its own and never applies an update during a block.
