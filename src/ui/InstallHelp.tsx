import { useState } from 'react';
import { browserKind, isIPad, isStandalone, promptInstall, useCanInstall } from '../lib/install';

/** Short, browser-specific "install the app" instructions with a one-click button where supported. */
export function InstallHelp() {
  const can = useCanInstall();
  const [done, setDone] = useState(isStandalone());
  if (done) return <p className="text-sm text-green-800" data-testid="installed">Test Simulator is installed on this device.</p>;
  const b = browserKind();
  return (
    <div className="text-sm" data-testid="install-help">
      {can ? (
        <button className="btn-primary" onClick={async () => setDone(await promptInstall())} data-testid="install-btn">
          Install Test Simulator
        </button>
      ) : b === 'chromium' ? (
        <p>In Chrome or Edge, click the install icon at the right end of the address bar (a monitor with a down-arrow), or open the ⋮ menu and choose <b>Install Test Simulator</b> (in Edge: <b>Apps → Install this site as an app</b>).</p>
      ) : isIPad() ? (
        <p>On iPad: tap the Share button, then <b>Add to Home Screen</b>.</p>
      ) : b === 'safari' ? (
        <p>In Safari on a Mac: choose <b>File → Add to Dock</b>.</p>
      ) : (
        <p>This browser cannot install apps. Test Simulator still works here in a normal tab. For the best experience use Chrome or Edge on a laptop.</p>
      )}
      <p className="mt-2 text-gray-700">Installed, it opens in its own window, works offline, and the browser is much less likely to clear its storage.</p>
    </div>
  );
}
