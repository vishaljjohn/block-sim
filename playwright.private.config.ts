import base from './playwright.config';
/** Local only: runs the import pipeline on /private-test (never committed). Results go to /private-results. */
export default {
  ...base,
  testDir: 'tests/private',
  timeout: 45 * 60_000,
  retries: 0,
  projects: [{ ...base.projects![0], use: { ...base.projects![0].use, viewport: { width: 1440, height: 900 } } }],
};
