import { APP_VERSION, BUILD_TIME, CHANNEL, STORAGE_PREFIX } from '../config';

const KEY = STORAGE_PREFIX + 'errors';

export interface LoggedError {
  t: number;
  where: string;
  message: string;
  stack: string;
}

export function readErrors(): LoggedError[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as LoggedError[];
  } catch {
    return [];
  }
}

export function logError(where: string, err: unknown): void {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
    const list = readErrors();
    list.push({ t: Date.now(), where, message: String(e.message).slice(0, 300), stack: String(e.stack ?? '').slice(0, 1500) });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-50)));
  } catch {}
}

export function installErrorLogging(): void {
  window.addEventListener('error', (ev) => logError('window', ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => logError('promise', ev.reason));
}

/** Version, browser, settings and the error log. Never includes question content or PDFs. */
export async function debugInfo(extra: Record<string, unknown>): Promise<string> {
  let storage: unknown = null;
  try {
    storage = await navigator.storage?.estimate?.();
  } catch {}
  return JSON.stringify(
    {
      app: 'Test Simulator',
      version: APP_VERSION,
      channel: CHANNEL,
      built: BUILD_TIME,
      when: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screen: `${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}`,
      window: `${window.innerWidth}x${window.innerHeight}`,
      standalone: window.matchMedia('(display-mode: standalone)').matches,
      folderApi: 'showDirectoryPicker' in window,
      storage,
      ...extra,
      errors: readErrors(),
    },
    null,
    2,
  );
}
