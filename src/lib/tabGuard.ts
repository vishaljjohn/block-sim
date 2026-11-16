import { TAB_CHANNEL } from '../config';

export type TabState = 'checking' | 'active' | 'blocked';

/**
 * Single-tab guard. Only one tab/window may write. A new tab asks "is anyone there?";
 * if an active tab answers, the new tab is blocked until the user chooses to take over,
 * at which point the old tab blocks itself.
 */
export function startTabGuard(onState: (s: TabState) => void): { takeOver: () => void; stop: () => void } {
  const id = Math.random().toString(36).slice(2);
  let state: TabState = 'checking';
  const set = (s: TabState) => {
    state = s;
    onState(s);
  };
  if (typeof BroadcastChannel === 'undefined') {
    set('active');
    return { takeOver: () => {}, stop: () => {} };
  }
  const ch = new BroadcastChannel(TAB_CHANNEL);
  ch.onmessage = (ev) => {
    const m = ev.data as { type: string; id: string };
    if (!m || m.id === id) return;
    if (m.type === 'hello' && state === 'active') ch.postMessage({ type: 'here', id });
    else if (m.type === 'here' && state === 'checking') set('blocked');
    else if (m.type === 'takeover') set('blocked');
  };
  ch.postMessage({ type: 'hello', id });
  const timer = setTimeout(() => {
    if (state === 'checking') set('active');
  }, 350);
  return {
    takeOver: () => {
      ch.postMessage({ type: 'takeover', id });
      set('active');
    },
    stop: () => {
      clearTimeout(timer);
      ch.close();
    },
  };
}
