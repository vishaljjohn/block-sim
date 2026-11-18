declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __CHANNEL__: string;

export const APP_NAME = 'Test Simulator';
export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_TIME: string = __BUILD_TIME__;
/** beta: the `beta` branch at /block-sim/beta/, for trying changes; it uses the same saved data as the live site */
export const CHANNEL: 'stable' | 'beta' = __CHANNEL__ === 'beta' ? 'beta' : 'stable';
export const IS_BETA = CHANNEL === 'beta';
/** Storage names. Kept from the app's first version so everyone's saved history stays where it is. */
export const DB_NAME = 'blocksim';
export const STORAGE_PREFIX = 'blocksim:';
export const TAB_CHANNEL = 'blocksim-tab';

/** Footer "Report a bug" link. Change this to wherever you want bug reports to go. */
export const BUG_REPORT_URL = 'https://github.com/vishaljjohn/block-sim/issues/new';

export const SCHEMA_VERSION = 2;
export const BACKUP_WARN_DAYS = 14;
export const SNAPSHOT_KEEP = 5;
export const SLEEP_GAP_MS = 60_000;
export const DEFAULT_SEC_PER_Q = 90;
export const REVIEW_INTERVAL_DAYS = [3, 7, 21, 60];
