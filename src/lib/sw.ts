/**
 * Registers the service worker that lets the app work offline. When online, opening the app always loads the newest
 * version (see sw.template.js), so there is no "update available" step; the page is never reloaded on its own.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const base = import.meta.env.BASE_URL;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(base + 'sw.js', { scope: base, updateViaCache: 'none' })
      .then((reg) => {
        // keep the offline copy fresh: check when the app is opened again and every hour
        const poll = () => reg.update().catch(() => {});
        setInterval(poll, 60 * 60 * 1000);
        document.addEventListener('visibilitychange', () => !document.hidden && poll());
      })
      .catch(() => {});
  });
}
