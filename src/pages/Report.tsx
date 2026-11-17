import { useState } from 'react';
import { db } from '../db';
import { classifyChange, isBlank, isCorrect, scoreAttempt } from '../lib/score';
import { downloadBlob, downloadText, toCsv } from '../lib/csv';
import { exportBackup } from '../lib/backup';
import { fmtDuration } from '../lib/timer';
import { fmtDateTime, go, useLive } from '../ui/hooks';
import { TimeChart } from '../ui/charts';
import { Check, Cross, IconFlag } from '../ui/icons';
import { MISS_REASONS } from '../types';
import { Donut, ScoreBar } from '../ui/ScoreBar';
import { backupFileName, useFolderStatus } from './Home';

type Show = 'correct' | 'incorrect' | 'marked' | 'omitted';
const SHOWS: { id: Show; label: string }[] = [
  { id: 'correct', label: 'Correct' },
  { id: 'incorrect', label: 'Incorrect' },
  { id: 'marked', label: 'Marked' },
  { id: 'omitted', label: 'Omitted' },
];

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-gray-300 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-700">{children}</span>;
}

export function Report({ attemptId }: { attemptId: string }) {
  const a = useLive(() => db.attempts.get(attemptId).then((x) => x ?? null), [attemptId]);
  const exam = useLive(async () => (a?.examId ? ((await db.exams.get(a.examId)) ?? null) : null), [a?.examId]);
  const folder = useFolderStatus();
  const [tab, setTab] = useState<'results' | 'analysis'>('results');
  const [show, setShow] = useState<Set<Show>>(new Set(['correct', 'incorrect', 'marked', 'omitted']));
  const [showMenu, setShowMenu] = useState(false);
  const [msg, setMsg] = useState('');
  if (a === undefined) return <div className="text-sm">Loading…</div>;
  if (a === null) return <div>This attempt was not found. <a className="link" href="#/">Back to the library</a></div>;
  if (a.status !== 'completed') return <div>This block is not finished yet. <a className="link" href={`#/test/${a.id}`}>Resume it</a></div>;
  const s = scoreAttempt(a);
  const ungraded = a.items.filter((i) => !i.key).length;

  const csv = () => {
    const rows: (string | number | null)[][] = [['Question', 'Exam question #', 'My answer', 'Correct answer', 'Result', 'Time (s)', 'Marked', 'Answer change', 'Reason for miss', 'Test note', 'Review note']];
    a.items.forEach((it, i) =>
      rows.push([i + 1, it.number, it.answer ?? '', it.key ?? '', isBlank(it) ? 'omitted' : isCorrect(it) ? 'correct' : 'incorrect', Math.round(it.timeMs / 1000), it.marked ? 'yes' : '', classifyChange(it) ?? '', MISS_REASONS.find((r) => r.id === it.missReason)?.label ?? '', it.note, it.reviewNote]),
    );
    downloadText(toCsv(rows), `test-simulator-results-${new Date(a.completedAt ?? Date.now()).toISOString().slice(0, 10)}.csv`);
  };
  const visible = a.items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => {
      const kind: Show = isBlank(it) ? 'omitted' : isCorrect(it) ? 'correct' : 'incorrect';
      return show.has(kind) || (show.has('marked') && it.marked);
    });
  const modeChips = [a.mode === 'tutor' ? 'Tutor' : 'Untutored', a.mode === 'exam' ? 'Timed' : 'Untimed'];

  return (
    <div data-testid="report">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <a className="link text-sm" href={a.examId ? `#/exam/${a.examId}` : '#/'}>
            ← {a.examId ? 'Previous tests' : 'Library'}
          </a>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={csv} data-testid="report-csv">Export CSV</button>
            <a className="btn-primary" href={`#/review/${a.id}`} data-testid="review-all">Review Test</a>
          </div>
        </div>
        <h1 className="text-2xl font-bold">{a.name}</h1>
        <div className="text-sm text-gray-600">
          {exam?.subject ? `${exam.subject} · ` : ''}
          {fmtDateTime(a.completedAt)}
        </div>

        <div className="mt-4 flex gap-6 border-b border-gray-200" role="tablist">
          {(['results', 'analysis'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className="-mb-px border-b-2 pb-2 text-[15px]" style={{ borderColor: tab === t ? '#1c4973' : 'transparent', color: tab === t ? '#111' : '#6b7280' }} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
              {t === 'results' ? 'Test Results' : 'Test Analysis'}
            </button>
          ))}
        </div>

        {tab === 'results' ? (
          <>
            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 text-[15px] text-gray-700">Your Score</div>
                <div className="mb-1 text-3xl font-bold" style={{ color: s.pct >= 70 ? '#15803d' : s.pct >= 50 ? '#b45309' : '#b91c1c' }} data-testid="score-pct">
                  {Math.round(s.pct)}%
                </div>
                <ScoreBar correct={s.correct} wrong={s.wrong} blank={s.blank} height={12} />
                <div className="mt-1 flex gap-4 text-sm">
                  <span className="text-green-700"><b data-testid="score-correct">{s.correct}</b> correct</span>
                  <span className="text-red-700"><b data-testid="score-wrong">{s.wrong}</b> incorrect</span>
                  <span className="text-gray-600"><b data-testid="score-blank">{s.blank}</b> omitted</span>
                </div>
              </div>
              <div>
                <div className="mb-2 text-[15px] text-gray-700">Test Settings</div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-600">Mode</td>
                      <td className="py-1.5 text-right">{modeChips.map((c) => <Chip key={c}>{c}</Chip>).reduce((p, c) => <>{p} {c}</>)}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-600">Questions</td>
                      <td className="py-1.5 text-right"><Chip>{s.total}</Chip></td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-600">Time used</td>
                      <td className="py-1.5 text-right"><Chip>{fmtDuration(s.timeMs)}</Chip> <Chip>avg {fmtDuration(s.avgMs)} / question</Chip></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            {ungraded > 0 && <div className="mt-3 rounded border border-yellow-600 bg-yellow-50 p-2 text-sm">{ungraded} question{ungraded === 1 ? ' has' : 's have'} no answer in the key and count as not correct. Add them under “Edit answer key” and this report updates.</div>}

            <div className="mt-5 flex items-center justify-end gap-2 text-sm">
              <span className="text-gray-600">Show:</span>
              <div className="relative">
                <button className="field min-w-[140px] text-left" onClick={() => setShowMenu((v) => !v)} data-testid="show-filter">
                  {show.size === 4 ? 'All' : [...show].map((x) => SHOWS.find((y) => y.id === x)!.label).join(', ') || 'None'} ▾
                </button>
                {showMenu && (
                  <div className="absolute right-0 z-10 mt-1 w-44 rounded border border-gray-300 bg-white p-1 shadow-lg">
                    {SHOWS.map((o) => (
                      <label key={o.id} className="flex items-center gap-2 px-2 py-1">
                        <input
                          type="checkbox"
                          checked={show.has(o.id)}
                          data-testid={`show-${o.id}`}
                          onChange={(e) => {
                            const n = new Set(show);
                            if (e.target.checked) n.add(o.id);
                            else n.delete(o.id);
                            setShow(n);
                          }}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-sm" data-testid="report-table">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2">Question</th>
                    <th className="px-3 py-2">Your answer</th>
                    <th className="px-3 py-2">Correct</th>
                    <th className="px-3 py-2">Time spent</th>
                    <th className="px-3 py-2">Answer change</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ it, i }) => (
                    <tr key={i} className="cursor-pointer border-b border-gray-100 hover:bg-blue-50" onClick={() => go(`/review/${a.id}?i=${i}`)} data-testid={`report-row-${i + 1}`} data-result={isBlank(it) ? 'blank' : isCorrect(it) ? 'correct' : 'incorrect'}>
                      <td className="px-3 py-2.5">{isCorrect(it) ? <Check /> : isBlank(it) ? <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-blue-500" title="Omitted" /> : <Cross />}</td>
                      <td className="px-3 py-2.5">
                        {i + 1}
                        {it.number !== i + 1 && <span className="text-gray-500"> (Q{it.number})</span>} {it.marked && <IconFlag size={11} />}
                      </td>
                      <td className="px-3 py-2.5">{it.answer ?? '—'}</td>
                      <td className="px-3 py-2.5">{it.key ?? ''}</td>
                      <td className="px-3 py-2.5">{fmtDuration(it.timeMs)}</td>
                      <td className="px-3 py-2.5">{classifyChange(it) ?? ''}</td>
                      <td className="px-3 py-2.5 text-gray-600">{MISS_REASONS.find((r) => r.id === it.missReason)?.label ?? ''}</td>
                      <td className="px-3 py-2.5 text-right text-gray-400">›</td>
                    </tr>
                  ))}
                  {!visible.length && (
                    <tr>
                      <td colSpan={8} className="px-3 py-4 text-center text-gray-500">No questions match the filter.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div data-testid="analysis">
            <div className="mt-6 grid items-center gap-8 md:grid-cols-3">
              <div className="flex items-center gap-5">
                <Donut correct={s.correct} wrong={s.wrong} blank={s.blank} />
                <table className="text-sm">
                  <tbody>
                    {[
                      ['Correct', s.correct, '#16a34a'],
                      ['Incorrect', s.wrong, '#dc2626'],
                      ['Omitted', s.blank, '#9ca3af'],
                    ].map(([l, n, c]) => (
                      <tr key={l as string} className="border-b border-gray-100">
                        <td className="py-1.5 pr-6">
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: c as string }} />
                          {l}
                        </td>
                        <td className="py-1.5 text-right font-bold">{n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="mb-2 text-[15px] text-gray-700">Answer Changes</div>
                <table className="w-full text-sm" data-testid="changes">
                  <tbody>
                    <tr className="border-b border-gray-100"><td className="py-1.5">Correct to Incorrect</td><td className="py-1.5 text-right font-bold" data-testid="chg-rw">{s.changes['right→wrong']}</td></tr>
                    <tr className="border-b border-gray-100"><td className="py-1.5">Incorrect to Correct</td><td className="py-1.5 text-right font-bold" data-testid="chg-wr">{s.changes['wrong→right']}</td></tr>
                    <tr className="border-b border-gray-100"><td className="py-1.5">Incorrect to Incorrect</td><td className="py-1.5 text-right font-bold">{s.changes['wrong→wrong']}</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <div className="mb-2 text-[15px] text-gray-700">Time</div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-gray-100"><td className="py-1.5">Total</td><td className="py-1.5 text-right font-bold">{fmtDuration(s.timeMs)}</td></tr>
                    <tr className="border-b border-gray-100"><td className="py-1.5">Average per question</td><td className="py-1.5 text-right font-bold">{fmtDuration(s.avgMs)}</td></tr>
                    <tr className="border-b border-gray-100"><td className="py-1.5">Marked</td><td className="py-1.5 text-right font-bold">{a.items.filter((i) => i.marked).length}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-6 text-[15px] text-gray-700">Time per question</div>
            <TimeChart times={s.times} />
            <div className="text-xs text-gray-600">Green = correct, red = incorrect, grey = omitted. Hover a bar for details.</div>
          </div>
        )}
      </div>

      {!folder.connected && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-gray-300 bg-white p-2 text-sm" data-testid="backup-offer">
          This block is saved on this device. Keep a copy somewhere safe:
          <button className="btn" data-testid="report-backup" onClick={async () => { setMsg('Preparing…'); downloadBlob(await exportBackup(), backupFileName()); setMsg('Backup saved to Downloads.'); }}>
            Back up now
          </button>
          {msg && <span>{msg}</span>}
        </div>
      )}
    </div>
  );
}
