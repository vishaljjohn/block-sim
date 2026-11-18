import { useState } from 'react';
import type { Attempt } from '../types';
import { downloadBlob } from '../lib/csv';
import { exportAttemptPdf, type ExportOptions } from '../lib/exportPdf';
import { Modal } from './panels';

/** Choose what goes into the PDF of a finished block, then make and save it. */
export function ExportPdfDialog({ attempt, onClose }: { attempt: Attempt; onClose: () => void }) {
  const [o, setO] = useState<ExportOptions>({ highlights: true, strikes: true, explanations: true, which: 'all' });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const go = async () => {
    setErr('');
    setBusy('Preparing…');
    try {
      const blob = await exportAttemptPdf(attempt, o, (d, t) => setBusy(`Adding question ${d} of ${t}…`));
      const safe = attempt.name.replace(/[^\w-]+/g, '_').slice(0, 50) || 'test';
      downloadBlob(blob, `${safe}-${new Date(attempt.completedAt ?? Date.now()).toISOString().slice(0, 10)}.pdf`);
      setBusy('');
      onClose();
    } catch (e) {
      setBusy('');
      setErr('The PDF could not be made: ' + String((e as Error)?.message ?? e));
    }
  };
  const box = (k: 'highlights' | 'strikes' | 'explanations', label: string, help: string) => (
    <label className="mb-2 flex items-start gap-2">
      <input type="checkbox" checked={o[k]} onChange={(e) => setO({ ...o, [k]: e.target.checked })} data-testid={`pdf-${k}`} />
      <span>
        <b>{label}</b>
        <span className="block text-xs text-gray-600">{help}</span>
      </span>
    </label>
  );
  return (
    <Modal title="Export this test as a PDF" onClose={busy ? undefined : onClose}>
      <div className="text-sm" data-testid="pdf-dialog">
        <p className="mb-3 text-gray-700">Each question as it appeared, your answer and the correct one. The file is made on this computer and saved to your Downloads; you can open it in any PDF reader or note app.</p>
        {box('explanations', 'Include explanations', 'The explanation under each question.')}
        {box('highlights', 'Include my highlights', 'What you highlighted in the questions and in the explanations.')}
        {box('strikes', 'Include my strike-outs', 'Choices you struck out, crossed through.')}
        <div className="mb-1 mt-3 font-bold">Questions</div>
        <div className="mb-3 flex flex-wrap gap-3">
          {(
            [
              ['all', 'All'],
              ['incorrect', 'Incorrect and omitted'],
              ['marked', 'Marked'],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="flex items-center gap-1">
              <input type="radio" name="pdf-which" checked={o.which === v} onChange={() => setO({ ...o, which: v })} data-testid={`pdf-which-${v}`} /> {l}
            </label>
          ))}
        </div>
        {err && <div className="mb-2 text-red-700">{err}</div>}
        <div className="flex items-center justify-end gap-2">
          {busy && <span className="mr-auto text-gray-700" data-testid="pdf-busy">{busy}</span>}
          <button className="btn" onClick={onClose} disabled={!!busy}>Cancel</button>
          <button className="btn-primary" onClick={() => void go()} disabled={!!busy} data-testid="pdf-go">Make PDF</button>
        </div>
      </div>
    </Modal>
  );
}
