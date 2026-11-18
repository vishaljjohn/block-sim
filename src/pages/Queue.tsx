import { db } from '../db';
import { buildMissedBank, dueRows } from '../lib/missed';
import { go, useLive } from '../ui/hooks';
import { H1 } from '../ui/Shell';

const DAY = 86_400_000;

export function Queue() {
  const attempts = useLive(() => db.attempts.toArray(), []);
  const reviews = useLive(() => db.reviews.toArray(), []);
  const exams = useLive(() => db.exams.toArray(), []);
  if (!attempts || !reviews || !exams) return <div className="text-sm">Loading…</div>;
  const now = Date.now();
  const names = new Map(exams.map((e) => [e.id, e.name]));
  const bank = buildMissedBank(attempts, reviews);
  const due = dueRows(bank, now);
  const mastered = bank.filter((r) => r.schedule.status === 'Mastered').length;
  const learning = bank.length - mastered;
  const upcoming = bank.filter((r) => r.schedule.dueAt != null && r.schedule.dueAt > now).sort((x, y) => (x.schedule.dueAt ?? 0) - (y.schedule.dueAt ?? 0));
  const byExam = new Map<string, number>();
  for (const r of due) byExam.set(r.examId, (byExam.get(r.examId) ?? 0) + 1);
  const start = (ids: string[]) => go(`/redo?q=${ids.slice(0, 40).map(encodeURIComponent).join(',')}`);

  return (
    <div data-testid="queue">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <H1 sub="Missed questions come back on a spaced schedule until you get them right.">Review Queue</H1>
        <a className="btn" href="#/missed">All missed questions</a>
      </div>
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[
          { l: 'Total', v: bank.length, c: 'var(--ink)' },
          { l: 'Learning', v: learning, c: 'var(--warn)' },
          { l: 'Mastered', v: mastered, c: 'var(--good)' },
        ].map((t) => (
          <div key={t.l} className="card p-5" data-testid={`queue-${t.l.toLowerCase()}`}>
            <div className="eyebrow mb-1">{t.l}</div>
            <div className="mono text-[32px] font-bold leading-none" style={{ color: t.c }}>{t.v}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="card accent-top p-6">
          <div className="eyebrow mb-1">Study queue</div>
          <div className="serif text-[22px] font-bold">{due.length ? `${due.length} question${due.length === 1 ? '' : 's'} due today` : 'All caught up'}</div>
          <p className="mb-4 mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>{due.length ? 'Answer each one again. Right answers move further out; misses come back sooner.' : upcoming.length ? `Next one is due ${new Date(upcoming[0].schedule.dueAt!).toLocaleDateString()}.` : 'Finish a block; anything you miss shows up here.'}</p>
          {due.length > 0 && (
            <button className="btn-accent" onClick={() => start(due.map((r) => r.qid))} data-testid="queue-begin">
              Begin session ({Math.min(40, due.length)}) →
            </button>
          )}
          {byExam.size > 1 && (
            <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
              <div className="eyebrow mb-2">By exam</div>
              {[...byExam.entries()].map(([id, n]) => (
                <div key={id} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span className="truncate">{names.get(id) ?? 'Deleted exam'}</span>
                  <button className="btn btn-sm" onClick={() => start(due.filter((r) => r.examId === id).map((r) => r.qid))}>Study {n}</button>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card p-6">
          <div className="eyebrow mb-3">Coming up</div>
          {upcoming.length ? (
            upcoming.slice(0, 10).map((r) => (
              <div key={r.qid} className="flex justify-between gap-2 border-b py-1.5 text-[13px] last:border-b-0" style={{ borderColor: 'var(--line)' }}>
                <span className="truncate">{names.get(r.examId) ?? 'Exam'} · Q{r.number}</span>
                <span className="mono shrink-0 text-[11.5px]" style={{ color: 'var(--ink-2)' }}>in {Math.max(1, Math.ceil((r.schedule.dueAt! - now) / DAY))} d</span>
              </div>
            ))
          ) : (
            <div className="text-sm" style={{ color: 'var(--ink-3)' }}>Nothing scheduled.</div>
          )}
        </section>
      </div>
    </div>
  );
}
