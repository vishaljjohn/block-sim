declare const __APP_VERSION__: string;
declare const __CHANNEL__: string;
declare const __BUILD_TIME__: string;

export const APP_NAME = 'Test Simulator';
export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_TIME: string = __BUILD_TIME__;
export const CHANNEL: 'stable' | 'beta' = __CHANNEL__ === 'beta' ? 'beta' : 'stable';
export const IS_BETA = CHANNEL === 'beta';

/** Beta and stable share one browser origin on GitHub Pages, so every storage name is channel-specific. */
export const DB_NAME = IS_BETA ? 'blocksim-beta' : 'blocksim';
export const STORAGE_PREFIX = IS_BETA ? 'blocksim-beta:' : 'blocksim:';
export const TAB_CHANNEL = IS_BETA ? 'blocksim-beta-tab' : 'blocksim-tab';

/** Footer "Report a bug" link. Change this to wherever you want bug reports to go. */
export const BUG_REPORT_URL = 'https://github.com/vishaljjohn/block-sim/issues/new';

export const SCHEMA_VERSION = 2;
export const BACKUP_WARN_DAYS = 14;
export const SNAPSHOT_KEEP = 5;
export const SLEEP_GAP_MS = 60_000;
export const DEFAULT_SEC_PER_Q = 90;
export const REVIEW_INTERVAL_DAYS = [3, 7, 21, 60];
