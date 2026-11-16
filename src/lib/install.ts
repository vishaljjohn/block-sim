import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const subs = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  subs.forEach((f) => f());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  subs.forEach((f) => f());
});

export const isStandalone = (): boolean => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => deferred != null,
  );
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const r = await deferred.userChoice;
  deferred = null;
  subs.forEach((f) => f());
  return r.outcome === 'accepted';
}

export type Browser = 'chromium' | 'safari' | 'firefox' | 'other';
export function browserKind(): Browser {
  const ua = navigator.userAgent;
  if (/Edg\/|Chrome\//.test(ua) && !/OPR\//.test(ua)) return 'chromium';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}
export const isIPad = (): boolean => /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
