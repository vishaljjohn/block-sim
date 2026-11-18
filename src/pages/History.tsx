import { useState } from 'react';
import { db } from '../db';
import type { Attempt } from '../types';
import { scoreAttempt } from '../lib/score';
import { saveAttempt } from '../lib/store';
import { fmtDuration } from '../lib/timer';
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
    <button className="serif text-left text-[15px] font-bold hover:underline" title="Rename" onClick={() => { setV(a.name); setEdit(true); }} data-testid="history-name">
      {a.name} <span className="text-[11px] font-normal" style={{ color: 'var(--ink-3)' }}>✎</span>
    </button>
  );
}

export function History() {
  const attempts = useLive(() => db.attempts.toArray(), []);
  const exams = useLive(() => db.exams.toArray(), []);
  const [exam, setExam] = useState('');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<ModeFilter>('all');
  if (!attempts || !exams) return <div className="text-sm">Loading…</div>;
  const names = new Map(exams.map((e) => [e.id, e.name]));
  const rows = attempts
    .filter((a) => !exam || a.examId === exam)
    .filter((a) => mode === 'all' || modeOf(a).toLowerCase() === mode)
    .filter((a) => !q.trim() || (a.name + ' ' + (names.get(a.examId ?? '') ?? '')).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((x, y) => (y.completedAt ?? y.updatedAt) - (x.completedAt ?? x.updatedAt));

  return (
    <div data-testid="history">
      <H1 sub="Every test you have taken, newest first. Click a name to rename it.">Test History</H1>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="field" value={exam} onChange={(e) => setExam(e.target.value)} data-testid="history-exam">
          <option value="">All exams</option>
          {exams.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <input className="field w-56" placeholder="Search tests…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="history-search" />
        <div className="seg">
          {(['all', 'timed', 'tutor', 'untimed'] as ModeFilter[]).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)} data-testid={`history-mode-${m}`}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <span className="mono ml-auto text-[12px]" style={{ color: 'var(--ink-2)' }}>{rows.length} test{rows.length === 1 ? '' : 's'}</span>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th text-left">Test</th>
              <th className="th text-left">Mode</th>
              <th className="th text-left">Date</th>
              <th className="th text-left">Time</th>
              <th className="th text-left">Performance</th>
              <th className="th text-left">Breakdown</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const s = scoreAttempt(a);
              const done = a.status === 'completed';
              const answered = a.items.filter((i) => i.answer).length;
              return (
                <tr key={a.id} className="border-t" style={{ borderColor: 'var(--line)' }} data-testid="history-row">
                  <td className="px-3 py-3">
                    <NameCell a={a} />
                    <div className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>{a.examId ? (names.get(a.examId) ?? 'Deleted exam') : 'Mixed questions'} · {a.items.length} Q</div>
                  </td>
                  <td className="px-3 py-3"><span className="pill">{modeOf(a)}</span></td>
                  <td className="mono px-3 py-3 text-[12px]">{new Date(a.completedAt ?? a.updatedAt).toLocaleDateString()}<div style={{ color: 'var(--ink-3)' }}>{new Date(a.completedAt ?? a.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div></td>
                  <td className="mono px-3 py-3 text-[12px]">{fmtDuration(s.timeMs)}</td>
                  <td className="px-3 py-3">
                    {done ? (
                      <div className="flex items-center gap-2">
                        <span className="mono w-10 text-[13px] font-bold" style={{ color: s.pct >= 70 ? 'var(--good)' : s.pct >= 50 ? 'var(--warn)' : 'var(--bad)' }}>{Math.round(s.pct)}%</span>
                        <span className="block h-2 w-24" style={{ background: 'var(--line)' }}><span className="block h-full" style={{ width: `${s.pct}%`, background: s.pct >= 70 ? 'var(--good)' : s.pct >= 50 ? 'var(--warn)' : 'var(--bad)' }} /></span>
                      </div>
                    ) : (
                      <span className="pill" style={{ color: 'var(--warn)' }}>In progress · {answered}/{a.items.length}</span>
                    )}
                  </td>
                  <td className="mono px-3 py-3 text-[12px]">
                    <span style={{ color: 'var(--good)' }}>{s.correct}✓</span> <span style={{ color: 'var(--bad)' }}>{s.wrong}✗</span> <span style={{ color: 'var(--ink-3)' }}>{s.blank}–</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {done ? (
                      <span className="inline-flex gap-1.5">
                        <a className="btn btn-sm" href={`#/report/${a.id}`} data-testid="history-report">Report</a>
                        <a className="btn-primary btn-sm" href={`#/review/${a.id}`}>Review</a>
                      </span>
                    ) : (
                      <a className="btn-accent btn-sm" href={`#/test/${a.id}`} data-testid="history-resume">Resume</a>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center" style={{ color: 'var(--ink-3)' }}>No tests yet. Start one from the <a className="link" href="#/exams">Exams</a> page.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
