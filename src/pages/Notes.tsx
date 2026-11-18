import { useState } from 'react';
import { db, getMeta, setMeta, uid } from '../db';
import { useLive } from '../ui/hooks';
import { H1 } from '../ui/Shell';
import { PaperModal } from '../ui/PaperModal';

interface NoteRow {
  key: string;
  attemptId: string;
  attemptName: string;
  index: number;
  number: number;
  examId: string;
  t: number;
  kind: 'Highlight' | 'Test note' | 'Review note';
  text: string;
  color?: string;
}
interface Collection {
  id: string;
  name: string;
  keys: string[];
}
const COLL_KEY = 'noteCollections';
const SWATCH: Record<string, string> = { yellow: '#fde047', pink: '#fbcfe8', green: '#bbf7d0', blue: '#bfdbfe', purple: '#e9d5ff' };

export function Notes() {
  const attempts = useLive(() => db.attempts.toArray(), []);
  const exams = useLive(() => db.exams.toArray(), []);
  const colls = useLive(() => getMeta<Collection[]>(COLL_KEY, []), []);
  const [col, setCol] = useState('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  if (!attempts || !exams || !colls) return <div className="text-sm">Loading…</div>;
  const examById = new Map(exams.map((e) => [e.id, e]));
  const all: NoteRow[] = [];
  for (const a of attempts)
    a.items.forEach((it, index) => {
      const base = { attemptId: a.id, attemptName: a.name, index, number: it.number, examId: it.examId, t: a.completedAt ?? a.updatedAt };
      if (it.note?.trim()) all.push({ ...base, key: `${a.id}:${index}:n`, kind: 'Test note', text: it.note.trim() });
      if (it.reviewNote?.trim()) all.push({ ...base, key: `${a.id}:${index}:r`, kind: 'Review note', text: it.reviewNote.trim() });
      const expl = examById.get(it.examId)?.questions.find((x) => x.id === it.qid)?.explanation ?? '';
      (it.explHighlights ?? []).forEach((h) => {
        const text = expl.slice(h.s, h.e).trim();
        if (text) all.push({ ...base, key: `${a.id}:${index}:h${h.s}-${h.e}`, kind: 'Highlight', text, color: h.color ?? 'yellow' });
      });
    });
  all.sort((x, y) => y.t - x.t);
  const saveColls = (c: Collection[]) => void setMeta(COLL_KEY, c);
  const current = colls.find((c) => c.id === col);
  const inCol = current ? all.filter((n) => current.keys.includes(n.key)) : all;
  const shown = inCol.filter((n) => !q.trim() || n.text.toLowerCase().includes(q.trim().toLowerCase()));
  const done = new Set(attempts.filter((a) => a.status === 'completed').map((a) => a.id));
  const create = () => {
    const name = newName.trim();
    if (!name) return;
    const c = { id: uid('c'), name, keys: [] };
    saveColls([...colls, c]);
    setCol(c.id);
    setCreating(false);
    setNewName('');
  };
  const addTo = (cid: string, key: string) => saveColls(colls.map((c) => (c.id === cid && !c.keys.includes(key) ? { ...c, keys: [...c.keys, key] } : c)));
  const removeFrom = (cid: string, key: string) => saveColls(colls.map((c) => (c.id === cid ? { ...c, keys: c.keys.filter((k) => k !== key) } : c)));

  const CollBtn = ({ id, name, n }: { id: string; name: string; n: number }) => (
    <button className="mb-1 flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold" style={col === id ? { background: 'var(--navy)', color: 'var(--bg)' } : { color: 'var(--ink-2)' }} onClick={() => setCol(id)} data-testid={`coll-${id}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z" /></svg>
      <span className="truncate">{name}</span>
      <span className="mono ml-auto text-[11px]">{n}</span>
    </button>
  );

  return (
    <div data-testid="notes">
      <H1 rule sub="A personal collection of your highlights and annotations.">My Notes</H1>
      <div className="flex flex-col gap-8 md:flex-row">
        <nav className="w-full shrink-0 md:w-[260px]">
          <div className="mb-3 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Collections</div>
          <div className="mb-4 border p-1" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
            <CollBtn id="all" name="All Notes" n={all.length} />
            {colls.map((c) => (
              <CollBtn key={c.id} id={c.id} name={c.name} n={all.filter((x) => c.keys.includes(x.key)).length} />
            ))}
          </div>
          <button className="btn btn-caps w-full" onClick={() => setCreating(true)} data-testid="create-collection">+ Create collection</button>
          {current && (
            <button className="mt-2 w-full text-[12px] font-semibold" style={{ color: 'var(--bad)' }} onClick={() => window.confirm(`Delete the collection “${current.name}”? The notes themselves stay.`) && (saveColls(colls.filter((c) => c.id !== current.id)), setCol('all'))}>
              Delete this collection
            </button>
          )}
        </nav>
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-baseline justify-between gap-2 border-b-2 pb-3" style={{ borderColor: 'var(--line)' }}>
            <h2 className="text-[22px] font-bold">{current?.name ?? 'All Notes'}</h2>
            <span className="mono text-[12px]" style={{ color: 'var(--ink-2)' }}>{inCol.length} Notes</span>
          </div>
          {all.length > 0 && <input className="field mb-4 w-full" placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="notes-search" />}
          {shown.length ? (
            <div className="space-y-3">
              {shown.map((n) => {
                const ex = examById.get(n.examId);
                return (
                  <div key={n.key} className="card p-5" data-testid="note-row">
                    <div className="mono mb-2 flex flex-wrap items-center gap-2 text-[11.5px]" style={{ color: 'var(--ink-2)' }}>
                      <span className="pill" style={{ color: n.kind === 'Highlight' ? 'var(--brand)' : 'var(--ink-2)' }}>{n.kind}</span>
                      {ex?.name ?? 'Deleted exam'} · Q{n.number} · {n.attemptName} · {new Date(n.t).toLocaleDateString()}
                      <span className="ml-auto flex items-center gap-3">
                        {current ? (
                          <button className="font-sans font-semibold" style={{ color: 'var(--bad)' }} onClick={() => removeFrom(current.id, n.key)}>Remove</button>
                        ) : (
                          colls.length > 0 && (
                            <select className="field py-0.5 text-[11px]" value="" onChange={(e) => e.target.value && addTo(e.target.value, n.key)} aria-label="Add to collection" data-testid="add-to-collection">
                              <option value="">+ Add to collection</option>
                              {colls.map((c) => (
                                <option key={c.id} value={c.id}>{c.keys.includes(n.key) ? '✓ ' : ''}{c.name}</option>
                              ))}
                            </select>
                          )
                        )}
                        {done.has(n.attemptId) && <a className="link font-sans" href={`#/review/${n.attemptId}?i=${n.index}`}>Open question →</a>}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
                      {n.kind === 'Highlight' ? <mark style={{ background: SWATCH[n.color ?? 'yellow'] ?? SWATCH.yellow, color: '#1a2e3b' }}>{n.text}</mark> : n.text}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center border-2 border-dashed px-6 py-14 text-center" style={{ borderColor: 'var(--line)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--line)" strokeWidth="1.5" aria-hidden="true"><path d="M3 6h6l2 2h10v11H3z" /></svg>
              <div className="mt-2 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>No Notes Found</div>
              <p className="mb-5 mt-1 max-w-sm text-[14px]" style={{ color: 'var(--ink-2)' }}>
                {all.length ? (current ? 'This collection is empty. Add notes to it from All Notes.' : 'No notes match your search.') : 'You haven’t saved any notes yet. Highlight text in an explanation while reviewing, or write a note during a test.'}
              </p>
              <a className="btn btn-caps" href="#/history">Find a question to study</a>
            </div>
          )}
        </div>
      </div>
      {creating && (
        <PaperModal title="Create Collection" onClose={() => setCreating(false)} width={420} footer={<><button className="btn" onClick={() => setCreating(false)}>Cancel</button><button className="btn-primary" onClick={create} data-testid="collection-save">Create</button></>}>
          <input className="field w-full" autoFocus placeholder="e.g., Cardiology pearls" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} data-testid="collection-name" />
        </PaperModal>
      )}
    </div>
  );
}
