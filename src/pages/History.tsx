import { useState } from 'react';
import { db } from '../db';
import type { Attempt } from '../types';
import { scoreAttempt } from '../lib/score';
import { deleteAttempt, saveAttempt } from '../lib/store';
import { useLive } from '../ui/hooks';
import { H1 } from '../ui/Shell';

type ModeFilter = 'all' | 'timed' | 'tutor' | 'untimed';
const isTimed = (a: Attempt) => a.blocks.some((b) => b.limitMs != null);
const modeOf = (a: Attempt): 'Tutor' | 'Timed' | 'Untimed' => (a.mode === 'tutor' ? 'Tutor' : isTimed(a) ? 'Timed' : 'Untimed');

function NameCell({ a }: { a: Attempt }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(a.name);
  if (edit)
    return (
      <form
        className="flex gap-1"
        onSubmit={async (e) => {
          e.preventDefault();
          const name = v.trim();
          if (name && name !== a.name) {
            const fresh = await db.attempts.get(a.id);
            if (fresh) await saveAttempt({ ...fresh, name });
          }
          setEdit(false);
        }}
      >
        <input className="field w-48 text-sm" value={v} autoFocus onChange={(e) => setV(e.target.value)} onBlur={() => setEdit(false)} data-testid="history-name-input" />
      </form>
    );
  return (
    <button className="block text-left text-[12px] hover:underline" style={{ color: 'var(--ink-2)' }} title="Rename" onClick={() => { setV(a.name); setEdit(true); }} data-testid="history-name">
      ✎ {a.name}
    </button>
  );
}

const took = (a: Attempt) => a.blocks.reduce((n, b) => n + b.timer.elapsedMs, 0);
const answering = (a: Attempt) => a.items.reduce((n, it) => n + it.timeMs, 0);
const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}h:` : ''}${String(m).padStart(2, '0')}m:${String(s % 60).padStart(2, '0')}s`;
};
const when = (t: number) => `${new Date(t).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} at ${new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

export function History() {
  const attempts = useLive(() => db.attempts.toArray(), []);
  const exams = useLive(() => db.exams.toArray(), []);
  const [exam, setExam] = useState('');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<ModeFilter>('all');
  if (!attempts || !exams) return <div className="text-sm">Loading…</div>;
  const names = new Map(exams.map((e) => [e.id, e]));
  const rows = attempts
    .filter((a) => !exam || a.examId === exam)
    .filter((a) => mode === 'all' || modeOf(a).toLowerCase() === mode)
    .filter((a) => !q.trim() || (a.name + ' ' + (names.get(a.examId ?? '')?.name ?? '') + ' ' + (names.get(a.examId ?? '')?.subject ?? '')).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((x, y) => (y.completedAt ?? y.updatedAt) - (x.completedAt ?? x.updatedAt));
  const examsIn = (a: Attempt) => [...new Set(a.items.map((i) => i.examId))].map((id) => names.get(id));

  return (
    <div data-testid="history">
      <H1 rule sub="A ledger of your past examination attempts and performance records.">Test History</H1>
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded border p-4" style={{ borderColor: 'var(--line)', background: 'var(--bg)', boxShadow: '0 1px 2px rgb(0 0 0 / 0.05)' }}>
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          Exam:
          <select className="field min-w-[220px] rounded bg-[var(--surface-2)] py-1.5" value={exam} onChange={(e) => setExam(e.target.value)} data-testid="history-exam">
            <option value="">All exams</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          Search:
          <input className="field w-64 rounded bg-[var(--surface-2)] py-1.5" placeholder="Search exams, folders, names…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="history-search" />
        </label>
        <div className="ml-auto flex rounded p-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
          {(['all', 'timed', 'tutor', 'untimed'] as ModeFilter[]).map((m) => (
            <button key={m} className="rounded px-4 py-1.5 text-[14px]" style={mode === m ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 2px rgb(0 0 0 / 0.1)', fontWeight: 600 } : { color: 'var(--ink-2)' }} onClick={() => setMode(m)} data-testid={`history-mode-${m}`}>
              {m === 'all' ? '▦ All' : m === 'timed' ? '◷ Timed' : m === 'tutor' ? '⌂ Tutor' : 'Untimed'}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto border-2" style={{ borderColor: 'var(--line)' }}>
        <table className="w-full text-sm" style={{ background: 'var(--bg)' }}>
          <thead>
            <tr>
              <th className="th text-left">Exam &amp; Mode</th>
              <th className="th text-left">Folders &amp; Exams</th>
              <th className="th text-left">Time</th>
              <th className="th text-left">Performance</th>
              <th className="th text-left">Breakdown</th>
              <th className="th text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const s = scoreAttempt(a);
              const done = a.status === 'completed';
              const answered = a.items.filter((i) => i.answer).length;
              const inc = a.items.filter((i) => i.answer && i.key && i.answer !== i.key).length;
              const pct = done ? s.pct : answered ? (s.correct / Math.max(1, a.items.length)) * 100 : 0;
              const color = pct >= 70 ? 'var(--good)' : pct >= 60 ? 'var(--ink)' : 'var(--bad)';
              const ex = examsIn(a);
              return (
                <tr key={a.id} className="border-t" style={{ borderColor: 'var(--line)' }} data-testid="history-row">
                  <td className="px-4 py-4 align-middle">
                    <NameCell a={a} />
                    <div className="text-[15px]" style={{ color: 'var(--ink)' }}>{a.examId ? (names.get(a.examId)?.name ?? 'Deleted exam') : 'Mixed questions'}</div>
                    <span className="badge-mode mt-1">{modeOf(a)} mode</span>
                  </td>
                  <td className="max-w-[240px] px-4 py-4 text-[12.5px]">
                    <div className="flex gap-2 truncate border-b pb-1" style={{ borderColor: 'var(--line)' }}><span className="mono text-[10px] font-bold" style={{ color: 'var(--ink-2)' }}>FLD</span><span className="truncate font-semibold">{[...new Set(ex.map((e) => e?.subject?.trim() || 'No folder'))].join(', ')}</span></div>
                    <div className="flex gap-2 truncate pt-1"><span className="mono text-[10px] font-bold" style={{ color: 'var(--ink-2)' }}>EXM</span><span className="truncate font-semibold">{ex.map((e) => e?.name ?? 'Deleted exam').join(', ')}</span></div>
                  </td>
                  <td className="mono whitespace-nowrap px-4 py-4">
                    <div className="text-[16px]">Took: {clock(took(a))}</div>
                    <div className="text-[12px]" style={{ color: 'var(--ink-2)' }}>Answering: {clock(answering(a))}</div>
                    <div className="text-[12px]" style={{ color: 'var(--ink-2)' }}>{when(a.completedAt ?? a.updatedAt)}</div>
                  </td>
                  <td className="w-[200px] px-4 py-4">
                    <div className="mono mb-1 text-center text-[20px] font-bold" style={{ color }}>{pct.toFixed(1)}%</div>
                    <div className="flex h-1.5 w-full" style={{ background: 'var(--line)' }}>
                      <span style={{ width: `${(s.correct / Math.max(1, a.items.length)) * 100}%`, background: 'var(--good)' }} />
                      <span style={{ flex: 1 }} />
                      <span style={{ width: `${(inc / Math.max(1, a.items.length)) * 100}%`, background: 'var(--bad)' }} />
                    </div>
                    {!done && <div className="mt-1 text-center text-[11px]" style={{ color: 'var(--warn)' }}>In progress · {answered}/{a.items.length}</div>}
                  </td>
                  <td className="mono whitespace-nowrap px-4 py-4 text-[12px]">
                    <div className="flex justify-between gap-6"><span style={{ color: 'var(--ink-2)' }}>Correct:</span><span style={{ color: 'var(--good)' }}>{s.correct}</span></div>
                    <div className="flex justify-between gap-6 border-b pb-0.5" style={{ borderColor: 'var(--line)' }}><span style={{ color: 'var(--ink-2)' }}>Incorrect:</span><span style={{ color: 'var(--bad)' }}>{inc}</span></div>
                    <div className="flex justify-between gap-6 pt-0.5 text-[13px] font-bold"><span>Total:</span><span>{a.items.length}</span></div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <span className="flex items-center gap-4 text-[14px] font-semibold">
                      {!done && <a href={`#/test/${a.id}`} style={{ color: 'var(--good)' }} data-testid="history-resume">Resume ▷</a>}
                      {done && <a href={`#/report/${a.id}`} style={{ color: 'var(--brand)' }} data-testid="history-report">Review</a>}
                      <button title="Delete test" aria-label="Delete Test" style={{ color: 'var(--bad)' }} onClick={() => window.confirm(`Delete “${a.name}” and its answers? This cannot be undone.`) && void deleteAttempt(a.id)} data-testid="history-delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center" style={{ color: 'var(--ink-3)' }}>No tests yet. Start one from the <a className="link" href="#/exams">Exams</a> page.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
