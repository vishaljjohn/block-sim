import { useEffect, useRef, useState } from 'react';
import { IS_BETA } from './config';
import { db } from './db';
import { startTabGuard, type TabState } from './lib/tabGuard';
import { getSettings, maybeDailySnapshot, requestPersistence, setReadOnly } from './lib/store';
import { applyUpdate, registerServiceWorker, useUpdateAvailable } from './lib/sw';
import { ensureDemo } from './lib/demo';
import { initFolderSync } from './lib/folder';
import { resumeBackgroundText } from './lib/analyze';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Shell } from './ui/Shell';
import { go, useRoute } from './ui/hooks';
import { Home } from './pages/Home';
import { ImportPage } from './pages/Import';
import { KeyCheck } from './pages/KeyCheck';
import { ExamDetail } from './pages/ExamDetail';
import { BlockSetup } from './pages/BlockSetup';
import { TestScreen } from './pages/TestScreen';
import { Report } from './pages/Report';
import { Missed } from './pages/Missed';
import { Redo } from './pages/Redo';
import { SettingsPage } from './pages/Settings';
import { Faq } from './pages/Faq';
import { Welcome } from './pages/Welcome';
import { LayoutEditor } from './pages/LayoutEditor';
import { useApplyDisplay } from './lib/display';

registerServiceWorker();

export function App() {
  const [tab, setTab] = useState<TabState>('checking');
  const guard = useRef<ReturnType<typeof startTabGuard> | null>(null);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const route = useRoute();
  const update = useUpdateAvailable();
  useApplyDisplay();

  useEffect(() => {
    guard.current = startTabGuard((s) => {
      setReadOnly(s === 'blocked');
      setTab(s);
    });
    return () => guard.current?.stop();
  }, []);

  useEffect(() => {
    if (tab !== 'active' || ready) return;
    (async () => {
      try {
        await db.open();
        void requestPersistence();
        await initFolderSync();
        await ensureDemo();
        void maybeDailySnapshot();
        // finish reading any pages left over from an earlier session (OCR), in the background
        window.setTimeout(() => resumeBackgroundText(), 1500);
        const s = await getSettings();
        if (!s.welcomed && (window.location.hash === '' || window.location.hash === '#/' || window.location.hash === '#')) go('/welcome', true);
        setReady(true);
      } catch (e) {
        const err = e as Error;
        setFatal(err?.name === 'VersionError' ? 'VERSION' : String(err?.message ?? e));
      }
    })();
  }, [tab, ready]);

  if (tab === 'blocked') {
    return (
      <div className="mx-auto max-w-lg p-8" data-testid="tab-guard">
        <h1 className="mb-2 text-xl font-bold">Test Simulator is open elsewhere</h1>
        <p className="mb-4 text-sm">Test Simulator is already open in another tab or window. To keep your saved answers from conflicting, only one can be used at a time.</p>
        <button
          className="btn-primary"
          data-testid="take-over"
          onClick={() => {
            guard.current?.takeOver();
            // start from storage so nothing stale from before is written
            window.location.reload();
          }}
        >
          Use Test Simulator here instead
        </button>
        <p className="mt-3 text-xs text-gray-700">The other tab will stop and show this message.</p>
      </div>
    );
  }
  if (fatal === 'VERSION') {
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="mb-2 text-xl font-bold">Please update Test Simulator</h1>
        <p className="mb-2 text-sm">Your data was saved by a newer version of Test Simulator than the one loaded now. Nothing has been changed or lost. Close every Test Simulator window and open it again to get the newer version.</p>
        <button className="btn mt-3" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
  if (fatal) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="mb-2 text-xl font-bold">Test Simulator could not open its storage</h1>
        <p className="mb-2 text-sm">Your data has not been changed. This usually happens in a private/incognito window or when the browser's storage is full or blocked.</p>
        <pre className="whitespace-pre-wrap text-xs">{fatal}</pre>
        <button className="btn mt-3" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }
  if (!ready) return <div className="p-6 text-sm">Loading Test Simulator…</div>;

  const [p0, p1, p2] = route.parts;
  const inBlock = p0 === 'test';
  let screen: React.ReactNode;
  let bare = false;
  let wide = false;
  if (p0 === 'test' && p1) {
    screen = <TestScreen key={'t' + p1} attemptId={p1} review={false} />;
    bare = true;
  } else if (p0 === 'review' && p1) {
    screen = <TestScreen key={'r' + p1} attemptId={p1} review startIndex={route.query.has('i') ? Number(route.query.get('i')) : undefined} startFilter={route.query.get('filter') ?? undefined} />;
    bare = true;
  } else if (p0 === 'redo') {
    screen = <Redo key={route.query.toString()} qids={(route.query.get('q') ?? '').split(',').filter(Boolean)} />;
    wide = true;
  } else if (p0 === 'welcome') screen = <Welcome />;
  else if (p0 === 'import') screen = <ImportPage />;
  else if (p0 === 'exam' && p1 && p2 === 'key') {
    screen = <KeyCheck key={p1} examId={p1} />;
    wide = true;
  } else if (p0 === 'exam' && p1 && p2 === 'layout') {
    screen = <LayoutEditor key={p1} examId={p1} />;
    wide = true;
  } else if (p0 === 'exam' && p1) screen = <ExamDetail key={p1} examId={p1} />;
  else if (p0 === 'setup') screen = <BlockSetup key={route.query.toString()} examId={route.query.get('exam')} preset={route.query.get('pick')} bank={route.query.get('bank') === '1'} />;
  else if (p0 === 'report' && p1) screen = <Report key={p1} attemptId={p1} />;
  else if (p0 === 'missed') {
    screen = <Missed />;
    wide = true;
  }
  else if (p0 === 'settings') screen = <SettingsPage />;
  else if (p0 === 'faq') screen = <Faq />;
  else screen = <Home />;

  const name = route.parts.slice(0, 2).join('/') || 'home';
  return (
    <>
      {/* "Bold" display setting: thickens dark strokes in page images */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="bs-bold">
          <feMorphology operator="erode" radius="0.6" />
        </filter>
      </svg>
      {update && !inBlock && (
        <div className="flex items-center justify-center gap-3 border-b border-yellow-600 bg-yellow-100 px-3 py-1.5 text-sm" role="status" data-testid="update-banner">
          Update available{IS_BETA ? ' (beta)' : ''}.
          <button className="btn py-0.5" onClick={applyUpdate} data-testid="update-refresh">
            Refresh
          </button>
        </div>
      )}
      {bare ? (
        <div className="h-full">
          <ErrorBoundary name={name}>{screen}</ErrorBoundary>
        </div>
      ) : (
        <Shell path={route.path} wide={wide}>
          <ErrorBoundary name={name}>{screen}</ErrorBoundary>
        </Shell>
      )}
    </>
  );
}
