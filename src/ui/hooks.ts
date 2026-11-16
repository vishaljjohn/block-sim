import { liveQuery } from 'dexie';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** Re-runs a Dexie query whenever the data it read changes. undefined while loading. */
export function useLive<T>(fn: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [val, setVal] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(fn).subscribe({ next: (v) => setVal(v), error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return val;
}

function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '') || '/';
  const [path, q = ''] = h.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash);
  return parseHash(hash);
}

export function go(path: string, replace = false): void {
  if (replace) window.location.replace('#' + path);
  else window.location.hash = path;
}

export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const vis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [intervalMs, active]);
  return now;
}

/**
 * Width of an element, kept current with a ResizeObserver. Uses a callback ref so it also works
 * when the element only appears after a loading state.
 */
export function useElementWidth<E extends HTMLElement>(): [React.RefObject<E | null> & ((el: E | null) => void), number] {
  const [w, setW] = useState(0);
  const holder = useRef<{ el: E | null; ro: ResizeObserver | null }>({ el: null, ro: null });
  const cb = useRef<(React.RefObject<E | null> & ((el: E | null) => void)) | null>(null);
  if (!cb.current) {
    const fn = ((el: E | null) => {
      const h = holder.current;
      if (h.el === el) return;
      h.ro?.disconnect();
      h.ro = null;
      h.el = el;
      fn.current = el;
      if (el) {
        h.ro = new ResizeObserver(() => setW(el.clientWidth));
        h.ro.observe(el);
        setW(el.clientWidth);
      }
    }) as React.RefObject<E | null> & ((el: E | null) => void);
    (fn as { current: E | null }).current = null;
    cb.current = fn;
  }
  useEffect(() => () => holder.current.ro?.disconnect(), []);
  return [cb.current, w];
}

export function fmtDate(t: number | null | undefined): string {
  if (!t) return '';
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
export function fmtDateTime(t: number | null | undefined): string {
  if (!t) return '';
  return new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function daysAgo(t: number, now = Date.now()): number {
  return Math.floor((now - t) / 86_400_000);
}
