import { useState } from 'react';
import { db } from '../db';
import { buildMissedBank, dueRows } from '../lib/missed';
import { go, useLive } from '../ui/hooks';
import { H1 } from '../ui/Shell';
import { PaperModal } from '../ui/PaperModal';

const DAY = 86_400_000;

export function Queue() {
  const attempts = useLive(() => db.attempts.toArray(), []);
  const reviews = useLive(() => db.reviews.toArray(), []);
  const exams = useLive(() => db.exams.toArray(), []);
  const [deck, setDeck] = useState('');
  const [switching, setSwitching] = useState(false);
  if (!attempts || !reviews || !exams) return <div className="text-sm">Loading…</div>;
  const now = Date.now();
  const byId = new Map(exams.map((e) => [e.id, e]));
  const folderOf = (examId: string) => byId.get(examId)?.subject?.trim() || 'No folder';
  const all = buildMissedBank(attempts, reviews);
  const bank = deck ? all.filter((r) => r.examId === deck || folderOf(r.examId) === deck) : all;
  const due = dueRows(bank, now);
  const fresh = bank.filter((r) => r.schedule.status === 'New');
  const mastered = bank.filter((r) => r.schedule.status === 'Mastered').length;
  const learning = bank.length - mastered;
  const upcoming = bank.filter((r) => r.schedule.dueAt != null && r.schedule.dueAt > now).sort((x, y) => (x.schedule.dueAt ?? 0) - (y.schedule.dueAt ?? 0));
  const start = (ids: string[]) => go(`/redo?q=${ids.slice(0, 40).map(encodeURIComponent).join(',')}`);
  const folders = [...new Set(bank.map((r) => folderOf(r.examId)))].sort().map((f) => {
    const rows = bank.filter((r) => folderOf(r.examId) === f);
    const m = rows.filter((r) => r.schedule.status === 'Mastered').length;
    return { f, total: rows.length, mastered: m, learning: rows.length - m };
  });
  const deckName = deck ? (byId.get(deck)?.name ?? deck) : 'All missed questions';

  const Tile = ({ icon, label, value, color, sub, testId }: { icon: string; label: string; value: number; color: string; sub: string; testId: string }) => (
    <div className="flex flex-col items-center px-4 py-6 text-center" data-testid={testId}>
      <div className="mb-1 flex items-center gap-2 text-[16px] font-bold" style={{ fontFamily: 'var(--serif)' }}>
        <span style={{ color }}>{icon}</span> {label}
      </div>
      <div className="mono text-[40px] font-bold leading-tight" style={{ color }}>{value.toLocaleString()}</div>
      <div className="text-[11px]" style={{ color: 'var(--ink-2)' }}>{sub}</div>
    </div>
  );

  return (
    <div data-testid="queue">
      <H1 rule sub="A summary of your spaced-repetition progress on missed questions." right={<a className="btn" href="#/missed">All missed questions</a>}>
        Review Queue
      </H1>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-3 divide-x border-2" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
            <Tile icon="≋" label="Total Cards" value={bank.length} color="var(--ink)" sub="Missed questions in this deck." testId="queue-total" />
            <Tile icon="✓" label="Mastered" value={mastered} color="var(--good)" sub="Answered right on schedule." testId="queue-mastered" />
            <Tile icon="↻" label="Learning" value={learning} color="var(--bad)" sub="Still coming back." testId="queue-learning" />
          </div>
          <section className="card p-8">
            <h3 className="mb-5 text-[16px] font-normal">Subject Mastery</h3>
            {folders.length ? (
              folders.map((f) => {
                const pct = f.total ? (f.mastered / f.total) * 100 : 0;
                return (
                  <div key={f.f} className="mb-4 border-b pb-4 last:border-b-0" style={{ borderColor: 'var(--line)' }}>
                    <div className="mb-1.5 flex justify-between">
                      <span className="serif text-[15px] font-bold">{f.f}</span>
                      <span className="mono text-[12px] font-bold">{Math.round(pct)}%</span>
                    </div>
                    <div className="flex h-1.5" style={{ background: 'var(--line)' }}>
                      <div className="h-full" style={{ width: `${pct}%`, background: 'var(--good)' }} />
                      <div className="h-full flex-1" style={{ background: 'var(--bad)' }} />
                    </div>
                    <div className="mono mt-1 flex justify-between text-[11px]" style={{ color: 'var(--ink-2)' }}>
                      <span>{f.mastered}M / {f.learning}L</span>
                      <span>{f.total} card{f.total === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-[14px]" style={{ color: 'var(--ink-3)' }}>Finish a test; every question you miss becomes a card here.</div>
            )}
          </section>
          <section className="card p-8">
            <h3 className="mb-4 text-[16px] font-normal">Coming Up</h3>
            {upcoming.length ? (
              upcoming.slice(0, 12).map((r) => (
                <div key={r.qid} className="flex justify-between gap-2 border-b py-2 text-[13px] last:border-b-0" style={{ borderColor: 'var(--line)' }}>
                  <span className="truncate">{byId.get(r.examId)?.name ?? 'Exam'} · Q{r.number}</span>
                  <span className="mono shrink-0 text-[11.5px]" style={{ color: 'var(--ink-2)' }}>in {Math.max(1, Math.ceil((r.schedule.dueAt! - now) / DAY))} d</span>
                </div>
              ))
            ) : (
              <div className="text-[14px]" style={{ color: 'var(--ink-3)' }}>Nothing scheduled.</div>
            )}
          </section>
        </div>

        <aside className="space-y-3">
          <div className="border-2 border-dashed p-5 text-center" style={{ borderColor: 'var(--line)' }}>
            <div className="mb-3 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Study Queue</div>
            <div className="relative mx-auto mb-5 w-[220px]">
              <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 border" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }} />
              <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }} />
              <div className="relative border px-4 py-6 shadow-md" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                <div className="mono text-[36px] font-bold leading-none">{due.length}</div>
                <div className="mt-1 text-[14px] font-semibold" style={{ color: 'var(--ink-2)' }}>Cards to Review</div>
                <div className="mono mt-1 text-[11px]" style={{ color: 'var(--ink-2)' }}>{due.length} Due • {fresh.length} New</div>
              </div>
            </div>
            <button className="btn-primary btn-caps w-full" disabled={!due.length} onClick={() => start(due.map((r) => r.qid))} data-testid="queue-begin">
              Begin Session ›
            </button>
            {!due.length && <div className="mt-2 text-[12px]" style={{ color: 'var(--ink-2)' }}>{upcoming.length ? `Next card due ${new Date(upcoming[0].schedule.dueAt!).toLocaleDateString()}.` : 'All caught up.'}</div>}
          </div>
          <button className="btn btn-caps w-full" onClick={() => setSwitching(true)} data-testid="switch-deck">↻ Switch Deck</button>
          <div className="text-center text-[12px]" style={{ color: 'var(--ink-2)' }}>Deck: <b>{deckName}</b></div>
        </aside>
      </div>
      {switching && (
        <PaperModal title="Switch Deck" onClose={() => setSwitching(false)} width={480}>
          {[
            { id: '', label: 'All missed questions', n: all.length },
            ...[...new Set(all.map((r) => folderOf(r.examId)))].sort().map((f) => ({ id: f, label: `Folder: ${f}`, n: all.filter((r) => folderOf(r.examId) === f).length })),
            ...[...new Set(all.map((r) => r.examId))].map((id) => ({ id, label: byId.get(id)?.name ?? 'Deleted exam', n: all.filter((r) => r.examId === id).length })),
          ].map((d) => (
            <button key={d.id || 'all'} className="mb-1 flex w-full justify-between px-3 py-2.5 text-left text-[14px] font-semibold" style={deck === d.id ? { background: 'var(--navy)', color: 'var(--bg)' } : { background: 'var(--surface-2)' }} onClick={() => { setDeck(d.id); setSwitching(false); }}>
              <span className="truncate">{d.label}</span>
              <span className="mono text-[12px]">{d.n}</span>
            </button>
          ))}
        </PaperModal>
      )}
    </div>
  );
}
