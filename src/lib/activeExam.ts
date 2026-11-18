import { useSyncExternalStore } from 'react';
import { STORAGE_PREFIX } from '../config';

/** The exam "on your desk": the one the dashboard and "New Test" use. A per-browser preference, not exam data. */
const KEY = STORAGE_PREFIX + 'active-exam';
const subs = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};
export function setActiveExam(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  subs.forEach((f) => f());
}
export function useActiveExamId(): string {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      const s = (e: StorageEvent) => e.key === KEY && cb();
      window.addEventListener('storage', s);
      return () => {
        subs.delete(cb);
        window.removeEventListener('storage', s);
      };
    },
    read,
  );
}
