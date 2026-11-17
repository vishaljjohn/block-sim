import { useSyncExternalStore } from 'react';
import { chooseFolder, folderStatus, onFolderStatus } from '../lib/folder';
import { browserKind, isIPad } from '../lib/install';
import { patchSettings } from '../lib/store';
import { DEMO_ID } from '../lib/demo';
import { go } from '../ui/hooks';
import { H1, H2 } from '../ui/Shell';
import { InstallHelp } from '../ui/InstallHelp';

export function Welcome() {
  const folder = useSyncExternalStore(onFolderStatus, folderStatus);
  const finish = async (to = '/') => {
    await patchSettings({ welcomed: true });
    go(to, true);
  };
  const b = browserKind();
  return (
    <div className="max-w-3xl" data-testid="welcome">
      <H1>Welcome to Test Simulator</H1>
      <p className="mb-2 text-sm">
        Load any practice-question PDF and its answer key, then take it in a board-style test screen: timer, question list, mark, highlight, strike out, lab values and calculator. Every attempt is saved so you can come back weeks later and review what you missed.
      </p>
      <p className="mb-2 border border-gray-400 bg-gray-50 p-2 text-sm">
        <b>Works best in Chrome or Edge on a laptop.</b> {b !== 'chromium' && (isIPad() ? 'On iPad it works with touch, but folder saving is not available, so back up regularly.' : 'In this browser it works, but automatic folder saving is not available, so back up regularly.')} Nothing you load ever leaves this device. There are no accounts.
      </p>

      <H2>1. Where should your history be kept?</H2>
      {folder.supported ? (
        folder.connected ? (
          <p className="text-sm text-green-800" data-testid="welcome-folder-ok">Saving to “{folder.name}”.</p>
        ) : (
          <div className="text-sm">
            <p className="mb-2">Recommended: pick a folder called “Test Simulator”, ideally inside iCloud Drive, OneDrive, Dropbox or Google Drive. Everything is saved there as files, so it survives browser clean-ups and moves with you to a new computer.</p>
            <button className="btn-primary" onClick={() => void chooseFolder()} data-testid="welcome-folder">Choose a data folder</button>
            <span className="ml-3 text-gray-700">or continue without one (history stays in this browser; use Back up now from time to time).</span>
          </div>
        )
      ) : (
        <p className="text-sm">This browser keeps your history in its own storage. Use <b>Back up now</b> on the Library screen every week or two, and keep the backup file somewhere safe.</p>
      )}

      <H2>2. Install the app (optional)</H2>
      <InstallHelp />

      <H2>3. Try it</H2>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => void finish(`/setup?exam=${DEMO_ID}`)} data-testid="welcome-demo">Try the 5-question demo exam</button>
        <button className="btn" onClick={() => void finish('/import')}>Import my own PDF</button>
        <button className="btn" onClick={() => void finish('/import?folder=1')}>Import a whole folder of exams</button>
        <button className="btn" onClick={() => void finish('/')} data-testid="welcome-skip">Go to the Library</button>
      </div>
    </div>
  );
}
