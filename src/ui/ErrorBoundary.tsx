import { Component, type ReactNode } from 'react';
import { logError } from '../lib/errorLog';
import { exportBackup } from '../lib/backup';
import { downloadBlob } from '../lib/csv';

interface State {
  error: Error | null;
  busy: boolean;
  msg: string;
}

/** A crash never shows a blank page: it says the data is safe and offers an export. */
export class ErrorBoundary extends Component<{ children: ReactNode; name: string }, State> {
  state: State = { error: null, busy: false, msg: '' };
  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }
  componentDidCatch(error: Error) {
    logError('screen:' + this.props.name, error);
  }
  componentDidUpdate(prev: { name: string }) {
    if (prev.name !== this.props.name && this.state.error) this.setState({ error: null, msg: '' });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl p-6" role="alert" data-testid="crash-screen">
        <h1 className="mb-2 text-xl font-bold">Something went wrong on this screen</h1>
        <p className="mb-3 text-sm">
          <b>Your data is safe.</b> Your exams, answers and history are stored on this device and were not affected. You can export a backup right now to be certain.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            className="btn-primary"
            disabled={this.state.busy}
            onClick={async () => {
              this.setState({ busy: true, msg: '' });
              try {
                downloadBlob(await exportBackup(), `block-sim-backup-${new Date().toISOString().slice(0, 10)}.zip`);
                this.setState({ msg: 'Backup downloaded.' });
              } catch (e) {
                this.setState({ msg: 'Export failed: ' + String(e) });
              }
              this.setState({ busy: false });
            }}
          >
            Export backup
          </button>
          <button className="btn" onClick={() => { window.location.hash = '/'; this.setState({ error: null }); }}>
            Back to Home
          </button>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </div>
        {this.state.msg && <p className="mb-2 text-sm">{this.state.msg}</p>}
        <details className="text-xs text-gray-700">
          <summary>Technical details</summary>
          <pre className="whitespace-pre-wrap">{String(this.state.error.message)}</pre>
        </details>
      </div>
    );
  }
}
