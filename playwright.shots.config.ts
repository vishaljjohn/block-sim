import base from './playwright.config';
export default { ...base, testDir: 'tests/shots', projects: [base.projects![0]] };
