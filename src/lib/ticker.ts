/**
 * A once-a-second tick that keeps going in a background tab. Browsers slow page timers in hidden tabs to about
 * once a minute, which would look like the computer went to sleep; a dedicated worker's timer is not slowed.
 * When the computer really sleeps the worker stops too, so sleep is still detected.
 */
export function startTicker(fn: () => void, ms = 1000): () => void {
  let worker: Worker | null = null;
  try {
    const src = `setInterval(function(){postMessage(0)},${ms})`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = () => fn();
    return () => worker?.terminate();
  } catch {
    const id = window.setInterval(fn, ms);
    return () => window.clearInterval(id);
  }
}
