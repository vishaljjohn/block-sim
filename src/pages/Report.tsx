import { useState } from 'react';
import { db } from '../db';
import { classifyChange, isBlank, isCorrect, scoreAttempt } from '../lib/score';
import { downloadBlob, downloadText, toCsv } from '../lib/csv';
import { exportBackup } from '../lib/backup';
import { fmtDuration } from '../lib/timer';
import { fmtDateTime, useLive } from '../ui/hooks';
import { H1, H2 } from '../ui/Shell';
import { BucketTable, TimeChart } from '../ui/charts';
import { Check, Cross, IconFlag } from '../ui/icons';
import { MISS_REASONS } from '../types';
import { backupFileName, useFolderStatus } from './Home';

export function Report({ attemptId }: { attemptId: string }) {
  const a = useLive(() => db.attempts.get(attemptId).then((x) => x ?? null), [attemptId]);
  const folder = useFolderStatus();
  const [msg, setMsg] = useState('');
  if (a === undefined) return <div className="text-sm">Loading…</div>;
  if (a === null) return <div>This attempt was not found. <a className="link" href="#/">Back to the library</a></div>;
  if (a.status !== 'completed') return <div>This block is not finished yet. <a className="link" href={`#/test/${a.id}`}>Resume it</a></div>;
  const s = scoreAttempt(a);
  const ungraded = a.items.filter((i) => !i.key).length;

  const csv = () => {
    const rows: (string | number | null)[][] = [['Question', 'Exam question #', 'My answer', 'Correct answer', 'Result', 'Time (s)', 'Marked', 'Confidence', 'Answer change', 'Reason for miss', 'Tags', 'Test note', 'Review note']];
    a.items.forEach((it, i) =>
      rows.push([i + 1, it.number, it.answer ?? '', it.key ?? '', isBlank(it) ? 'blank' : isCorrect(it) ? 'correct' : 'incorrect', Math.round(it.timeMs / 1000), it.marked ? 'yes' : '', it.confidence ?? '', classifyChange(it) ?? '', MISS_REASONS.find((r) => r.id === it.missReason)?.label ?? '', it.tags.join('; '), it.note, it.reviewNote]),
    );
    downloadText(toCsv(rows), `block-sim-score-${new Date(a.completedAt ?? Date.now()).toISOString().slice(0, 10)}.csv`);
  };

  const Stat = ({ label, value, testId }: { label: string; value: string | number; testId?: string }) => (
    <div className="border border-gray-400 px-3 py-2">
      <div className="text-xl font-bold" data-testid={testId}>{value}</div>
      <div className="text-xs text-gray-700">{label}</div>
    </div>
  );

  return (
    <div data-testid="report">
      <a className="link text-sm" href={a.examId ? `#/exam/${a.examId}` : '#/'}>← {a.examId ? 'Exam' : 'Library'}</a>
      <H1>Score report: {a.name}</H1>
      <div className="mb-3 text-sm text-gray-700">
        {fmtDateTime(a.completedAt)} · <span className="capitalize">{a.mode}</span> mode{a.blocks.length > 1 ? ` · ${a.blocks.length} blocks` : ''}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-6">
        <Stat label="Correct" value={`${Math.round(s.pct)}%`} testId="score-pct" />
        <Stat label="Correct" value={s.correct} testId="score-correct" />
        <Stat label="Incorrect" value={s.wrong} testId="score-wrong" />
        <Stat label="Blank" value={s.blank} testId="score-blank" />
        <Stat label="Time used" value={fmtDuration(s.timeMs)} />
        <Stat label="Average per question" value={fmtDuration(s.avgMs)} />
      </div>
      {ungraded > 0 && <div className="mb-3 border border-yellow-600 bg-yellow-50 p-2 text-sm">{ungraded} question{ungraded === 1 ? ' has' : 's have'} no answer in the key and count as not correct. Add the answers under “Edit answer key” and this report updates.</div>}

      <div className="mb-2 flex flex-wrap gap-2">
        <a className="btn-primary" href={`#/review/${a.id}`} data-testid="review-all">Review all</a>
        <a className="btn" href={`#/review/${a.id}?filter=incorrect`} data-testid="review-incorrect">Review incorrect ({s.wrong + s.blank})</a>
        <a className="btn" href={`#/review/${a.id}?filter=marked`}>Review marked ({a.items.filter((i) => i.marked).length})</a>
        <button className="btn" onClick={csv} data-testid="report-csv">Export as CSV</button>
        <a className="btn" href="#/missed">Missed Questions</a>
      </div>
      {!folder.connected && (
        <div className="mb-3 flex flex-wrap items-center gap-3 border border-gray-400 bg-gray-50 p-2 text-sm" data-testid="backup-offer">
          This block is saved on this device. Keep a copy somewhere safe:
          <button className="btn" data-testid="report-backup" onClick={async () => { setMsg('Preparing…'); downloadBlob(await exportBackup(), backupFileName()); setMsg('Backup saved to Downloads.'); }}>
            Back up now
          </button>
          {msg && <span>{msg}</span>}
        </div>
      )}

      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <H2>Answer changes</H2>
          <table className="w-full border-collapse" data-testid="changes">
            <tbody>
              <tr><td className="td">Right → wrong</td><td className="td w-16 font-bold" data-testid="chg-rw">{s.changes['right→wrong']}</td></tr>
              <tr><td className="td">Wrong → right</td><td className="td font-bold" data-testid="chg-wr">{s.changes['wrong→right']}</td></tr>
              <tr><td className="td">Wrong → wrong</td><td className="td font-bold">{s.changes['wrong→wrong']}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <H2>Accuracy by confidence</H2>
          {a.settings.confidence || s.byConfidence.some((b) => b.label !== 'Not rated') ? <BucketTable buckets={s.byConfidence} head="Confidence" /> : <div className="text-sm text-gray-600">Confidence ratings were off for this block. Turn them on when you start a block.</div>}
        </div>
      </div>

      <H2>Time per question</H2>
      <TimeChart times={s.times} />
      <div className="text-xs text-gray-600">Green = correct, red = incorrect, gray = blank.</div>

      <H2>Score by tag</H2>
      {s.byTag.length ? <BucketTable buckets={s.byTag} head="Tag" /> : <div className="text-sm text-gray-600">No tags on these questions. Add tags under “Edit answer key”.</div>}

      <H2>Questions</H2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-400" data-testid="report-table">
          <thead>
            <tr>
              <th className="th">#</th>
              <th className="th">Result</th>
              <th className="th">My answer</th>
              <th className="th">Correct</th>
              <th className="th">Time</th>
              <th className="th">Change</th>
              <th className="th">Confidence</th>
              <th className="th">Tags</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {a.items.map((it, i) => (
              <tr key={i} data-testid={`report-row-${i + 1}`} data-result={isBlank(it) ? 'blank' : isCorrect(it) ? 'correct' : 'incorrect'}>
                <td className="td">{i + 1} {it.marked && <IconFlag size={11} />}</td>
                <td className="td">{isCorrect(it) ? <Check /> : isBlank(it) ? '—' : <Cross />}</td>
                <td className="td">{it.answer ?? ''}</td>
                <td className="td">{it.key ?? ''}</td>
                <td className="td">{fmtDuration(it.timeMs)}</td>
                <td className="td">{classifyChange(it) ?? ''}</td>
                <td className="td capitalize">{it.confidence ?? ''}</td>
                <td className="td">{it.tags.join(', ')}</td>
                <td className="td"><a className="link" href={`#/review/${a.id}?i=${i}`}>Review</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
