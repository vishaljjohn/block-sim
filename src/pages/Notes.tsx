import { useState } from 'react';
import { db } from '../db';
import { useLive } from '../ui/hooks';
import { H1 } from '../ui/Shell';

interface NoteRow {
  attemptId: string;
  attemptName: string;
  index: number;
  number: number;
  examId: string;
  t: number;
  kind: 'Test note' | 'Review note';
  text: string;
}

export function Notes() {
  const attempts = useLive(() => db.attempts.toArray(), []);
  const exams = useLive(() => db.exams.toArray(), []);
  const [col, setCol] = useState('');
  const [q, setQ] = useState('');
  if (!attempts || !exams) return <div className="text-sm">Loading…</div>;
  const names = new Map(exams.map((e) => [e.id, e.name]));
  const all: NoteRow[] = [];
  for (const a of attempts)
    a.items.forEach((it, index) => {
      const base = { attemptId: a.id, attemptName: a.name, index, number: it.number, examId: it.examId, t: a.completedAt ?? a.updatedAt };
      if (it.note?.trim()) all.push({ ...base, kind: 'Test note', text: it.note.trim() });
      if (it.reviewNote?.trim()) all.push({ ...base, kind: 'Review note', text: it.reviewNote.trim() });
    });
  all.sort((x, y) => y.t - x.t);
  const cols = [...new Set(all.map((n) => n.examId))].map((id) => ({ id, name: names.get(id) ?? 'Deleted exam', n: all.filter((x) => x.examId === id).length })).sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
  const shown = all.filter((n) => (!col || n.examId === col) && (!q.trim() || n.text.toLowerCase().includes(q.trim().toLowerCase())));
  const done = new Set(attempts.filter((a) => a.status === 'completed').map((a) => a.id));

  return (
    <div data-testid="notes">
      <H1 sub="Notes you wrote during tests and while reviewing, by exam.">My Notes</H1>
      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="w-full shrink-0 md:w-60">
          <div className="card p-3">
            <div className="rule-label mb-2 px-2">Collections</div>
            <button className="mb-0.5 flex w-full px-2.5 py-2 text-left text-sm font-medium" style={!col ? { background: 'var(--navy)', color: '#fff' } : { color: 'var(--ink-2)' }} onClick={() => setCol('')}>
              All notes <span className="mono ml-auto text-[11px]">{all.length}</span>
            </button>
            {cols.map((c) => (
              <button key={c.id} className="mb-0.5 flex w-full gap-2 px-2.5 py-2 text-left text-sm font-medium" style={col === c.id ? { background: 'var(--navy)', color: '#fff' } : { color: 'var(--ink-2)' }} onClick={() => setCol(c.id)}>
                <span className="truncate">{c.name}</span> <span className="mono ml-auto text-[11px]">{c.n}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className="min-w-0 flex-1">
          <input className="field mb-4 w-full" placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="notes-search" />
          {shown.length ? (
            <div className="space-y-3">
              {shown.map((n, i) => (
                <div key={i} className="card p-4" data-testid="note-row">
                  <div className="mono mb-1.5 flex flex-wrap items-center gap-2 text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                    <span className="pill">{n.kind}</span>
                    {names.get(n.examId) ?? 'Deleted exam'} · Q{n.number} · {n.attemptName} · {new Date(n.t).toLocaleDateString()}
                    {done.has(n.attemptId) && <a className="link ml-auto" href={`#/review/${n.attemptId}?i=${n.index}`}>Open question →</a>}
                  </div>
                  <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{n.text}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-10 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
              {all.length ? 'No notes match.' : 'No notes yet. Use the Notes button during a test, or write a review note on any question while reviewing.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
