import { useSyncExternalStore } from 'react';

let waiting: ServiceWorker | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

/** Registers the service worker. Updates are NEVER applied automatically: the user presses Refresh. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const base = import.meta.env.BASE_URL;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(base + 'sw.js', { scope: base })
      .then((reg) => {
        const track = (w: ServiceWorker | null) => {
          if (!w) return;
          const check = () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              waiting = w;
              notify();
            }
          };
          check();
          w.addEventListener('statechange', check);
        };
        track(reg.waiting);
        reg.addEventListener('updatefound', () => track(reg.installing));
        // look for a new version when the app is opened and every hour after
        const poll = () => reg.update().catch(() => {});
        setInterval(poll, 60 * 60 * 1000);
        document.addEventListener('visibilitychange', () => !document.hidden && poll());
      })
      .catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // only reload when the user asked for the update
      if (reloaded || !applying) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

let applying = false;
export function applyUpdate(): void {
  if (!waiting) return;
  applying = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => waiting != null,
  );
}

/** Test hook: lets the end-to-end tests show the banner without shipping a second build. */
(window as unknown as { __blocksimFakeUpdate?: () => void }).__blocksimFakeUpdate = () => {
  waiting = { postMessage: () => window.location.reload() } as unknown as ServiceWorker;
  notify();
};
