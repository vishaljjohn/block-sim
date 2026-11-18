import { useMemo, useState } from 'react';
import { db } from '../db';
import type { Attempt, Exam } from '../types';
import { isCorrect, scoreAttempt } from '../lib/score';
import { assessment, fmtHours, folderStats, progressOf, questionStats, scoreSeries, studyByDay, timeStudied } from '../lib/stats';
import { useLive } from '../ui/hooks';
import { H1 } from '../ui/Shell';
import { AreaChart, DayBars, HBars, MultiLine, ScoreBars, Sparkline } from '../ui/paperCharts';

const DAY = 86_400_000;
type Range = 'all' | '7' | '30' | '90';
const folderName = (e: Exam | undefined) => e?.subject?.trim() || 'No folder';

function Kpi({ label, value, sub, color, extra, testId }: { label: string; value: string; sub?: React.ReactNode; color?: string; extra?: React.ReactNode; testId?: string }) {
  return (
    <div className="card p-6" data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[16px]">{label}</div>
          <div className="text-[16px]" style={{ color: color ?? 'var(--ink)' }}>{value}</div>
        </div>
        {extra}
      </div>
      {sub && <div className="mono mt-1 text-[12px]" style={{ color: 'var(--ink-2)' }}>{sub}</div>}
    </div>
  );
}

function Card({ title, children, testId, className = '' }: { title: string; children: React.ReactNode; testId?: string; className?: string }) {
  return (
    <section className={'card p-8 ' + className} data-testid={testId}>
      <h3 className="mb-5 text-[16px] font-normal">{title}</h3>
      {children}
    </section>
  );
}

/** Bars with a page switcher when the list is long. */
function PagedBars({ rows, title }: { rows: { name: string; value: number | null }[]; title: string }) {
  const [page, setPage] = useState(0);
  const per = 8;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const p = Math.min(page, pages - 1);
  return (
    <div>
      <div className="eyebrow mb-3">{title}</div>
      <HBars rows={rows.slice(p * per, p * per + per)} empty="Nothing yet." />
      {pages > 1 && (
        <div className="mono mt-3 flex items-center justify-between text-[11px]">
          <button className="btn btn-sm" disabled={p === 0} onClick={() => setPage(p - 1)}>Previous</button>
          <span>Page {p + 1} of {pages}</span>
          <button className="btn btn-sm" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

export function Reports() {
  const allAttempts = useLive(() => db.attempts.toArray(), []);
  const exams = useLive(() => db.exams.toArray(), []);
  const [range, setRange] = useState<Range>('all');
  const [examId, setExamId] = useState('');
  const now = Date.now();
  const since = range === 'all' ? 0 : now - Number(range) * DAY;
  const attempts = useMemo(() => (allAttempts ?? []).filter((a) => (a.completedAt ?? a.updatedAt) >= since), [allAttempts, since]);
  const qs = useMemo(() => questionStats(attempts), [attempts]);
  const qsAll = useMemo(() => questionStats(allAttempts ?? []), [allAttempts]);
  if (!allAttempts || !exams) return <div className="text-sm">Loading…</div>;

  const byId = new Map(exams.map((e) => [e.id, e]));
  const real = exams.filter((e) => !e.isDemo);
  const pool = examId ? exams.filter((e) => e.id === examId) : real.length ? real : exams;
  const p = progressOf(pool.flatMap((e) => e.questions.map((q) => q.id)), qs);
  const pAll = progressOf(pool.flatMap((e) => e.questions.map((q) => q.id)), qsAll);
  const series = scoreSeries(attempts, examId || undefined);
  const a = assessment(p.accuracy);
  const week = studyByDay(allAttempts, 7, now);
  const thisWeek = timeStudied(allAttempts, examId || undefined, now - 7 * DAY);
  const lastWeek = timeStudied(allAttempts, examId || undefined, now - 14 * DAY) - thisWeek;
  const days = range === 'all' ? Math.max(1, Math.ceil((now - Math.min(now, ...allAttempts.map((x) => x.createdAt))) / DAY)) : Number(range);
  const studied = timeStudied(attempts, examId || undefined);
  const folders = folderStats(pool, qs);
  const examRows = pool.map((e) => ({ name: e.name, p: progressOf(e.questions.map((q) => q.id), qs) }));
  const ranked = folders.filter((f) => f.p.answered > 0).sort((x, y) => (y.p.accuracy ?? 0) - (x.p.accuracy ?? 0));
  const strengths = ranked.slice(0, 3);
  const focus = [...ranked].reverse().slice(0, 3);
  const done: Attempt[] = attempts.filter((x) => x.status === 'completed' && (!examId || x.items.some((i) => i.examId === examId))).sort((x, y) => (x.completedAt ?? 0) - (y.completedAt ?? 0));
  // accuracy per folder in each finished test → trend lines
  const trend = new Map<string, { t: number; y: number }[]>();
  for (const t of done) {
    const g = new Map<string, { c: number; n: number }>();
    for (const it of t.items) {
      const k = folderName(byId.get(it.examId));
      const v = g.get(k) ?? { c: 0, n: 0 };
      v.n++;
      if (isCorrect(it)) v.c++;
      g.set(k, v);
    }
    for (const [k, v] of g) (trend.get(k) ?? trend.set(k, []).get(k)!).push({ t: t.completedAt ?? t.updatedAt, y: (v.c / v.n) * 100 });
  }
  const weekPct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
  const tone = a.tone === 'good' ? 'var(--good)' : a.tone === 'bad' ? 'var(--bad)' : a.tone === 'mid' ? 'var(--warn)' : 'var(--ink-3)';
  const dates = series.map((s) => ({ x: new Date(s.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), y: s.pct }));

  return (
    <div data-testid="reports">
      <H1 rule sub="A detailed analysis of your performance and study habits.">Performance Folio</H1>
      <div className="mb-8 flex flex-wrap items-center gap-4 border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          Timeframe:
          <select className="field bg-[var(--surface)] py-1.5" value={range} onChange={(e) => setRange(e.target.value as Range)} data-testid="reports-range">
            <option value="all">All Time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 3 months</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          Exam:
          <select className="field min-w-[260px] bg-[var(--surface)] py-1.5" value={examId} onChange={(e) => setExamId(e.target.value)} data-testid="reports-exam">
            <option value="">All exams</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--ink-2)' }}>Computed on this device</span>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Overall Score" value={p.accuracy == null ? '—' : `${p.accuracy.toFixed(1)}%`} color="var(--brand)" extra={<Sparkline values={series.map((s) => s.pct)} width={90} height={32} />} testId="kpi-score" />
        <Kpi label="Questions Answered" value={String(p.answered)} sub={`Overall: ${pAll.answered}`} testId="kpi-answered" />
        <Kpi label="Avg. Daily Study" value={fmtHours(studied / days)} sub="In selected timeframe" testId="kpi-daily" />
        <Kpi label="Time This Week" value={fmtHours(thisWeek)} sub={weekPct == null ? <span>No study the week before</span> : <span className="font-sans text-[14px] font-semibold" style={{ color: weekPct >= 0 ? 'var(--good)' : 'var(--bad)' }}>{weekPct >= 0 ? '+' : ''}{weekPct}% vs last week</span>} testId="kpi-week" />
      </div>

      <div className="mb-8 grid gap-8 xl:grid-cols-[372px_1fr]">
        <section className="card p-12" data-testid="reports-readiness">
          <div className="mb-5 flex items-center justify-between gap-2">
            <span className="serif flex items-center gap-2 text-[18px] font-bold">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /></svg>
              Exam Readiness
            </span>
            <span className="rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${tone} 30%, transparent)` }}>{a.label}</span>
          </div>
          <div className="eyebrow-mono">Overall accuracy</div>
          <div className="mono text-[60px] font-bold leading-tight">{p.accuracy == null ? '—' : `${Math.round(p.accuracy)}%`}</div>
          <p className="mb-5 text-[14px]" style={{ color: 'var(--ink-2)' }}>{a.text}</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['◎', `${Math.round(p.completedPct)}%`, 'Completed'],
              ['↗', String(done.length), 'Tests'],
            ].map(([i, v, l]) => (
              <div key={l} className="rounded-md border-2 border-dashed py-3 text-center" style={{ borderColor: 'var(--brand)', background: 'var(--surface-2)' }}>
                <div className="text-[12px]" style={{ color: 'var(--brand)' }}>{i}</div>
                <div className="mono text-[16px] font-bold">{v}</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.5px]" style={{ color: 'var(--ink-2)' }}>{l}</div>
              </div>
            ))}
          </div>
        </section>
        <Card title="Accuracy Trend" testId="reports-trend">
          <AreaChart points={dates} height={260} color="#d97706" line="#d97706" danger={60} />
        </Card>
      </div>

      <div className="mb-8 grid gap-8 xl:grid-cols-2">
        <Card title="Overall Score Over Time">
          <AreaChart points={dates} height={260} color="#a0522d" line="#1a2e3b" />
        </Card>
        <Card title="Study Time This Week" testId="reports-days">
          <DayBars days={week.map((d) => ({ label: new Date(d.day).toLocaleDateString(undefined, { weekday: 'short' }), hours: d.ms / 3_600_000 }))} height={260} />
        </Card>
      </div>

      <Card title="Progress Overview" testId="reports-folders" className="mb-8">
        <h4 className="mb-4 text-[18px] font-bold">By Folder</h4>
        <div className="mb-8 grid gap-8 lg:grid-cols-2">
          <PagedBars title="Completion" rows={folders.map((f) => ({ name: f.name, value: f.p.completedPct }))} />
          <PagedBars title="Correctness" rows={[...folders].sort((x, y) => (y.p.accuracy ?? -1) - (x.p.accuracy ?? -1)).map((f) => ({ name: f.name, value: f.p.accuracy }))} />
        </div>
        <h4 className="mb-4 text-[18px] font-bold">By Exam</h4>
        <div className="grid gap-8 lg:grid-cols-2">
          <PagedBars title="Completion" rows={examRows.map((f) => ({ name: f.name, value: f.p.completedPct }))} />
          <PagedBars title="Correctness" rows={[...examRows].sort((x, y) => (y.p.accuracy ?? -1) - (x.p.accuracy ?? -1)).map((f) => ({ name: f.name, value: f.p.accuracy }))} />
        </div>
      </Card>

      <Card title="Subject Performance Analysis" className="mb-8">
        {[
          ['Top Strengths', strengths, 'var(--good)'],
          ['Areas for Focus', focus, 'var(--bad)'],
        ].map(([t, list, c]) => (
          <div key={t as string} className="mb-6">
            <h4 className="mb-3 text-[18px] font-bold" style={{ color: c as string }}>{t as string}</h4>
            {(list as typeof ranked).length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {(list as typeof ranked).map((f) => (
                  <div key={f.name} className="border-l-4 px-3 py-2.5" style={{ borderColor: c as string, background: 'var(--surface-2)' }}>
                    <div className="flex justify-between text-[13px] font-bold">
                      <span>{f.name}</span>
                      <span className="mono">{(f.p.accuracy ?? 0).toFixed(1)}%</span>
                    </div>
                    <div className="mono flex justify-between text-[11px]" style={{ color: 'var(--ink-2)' }}>
                      <span>{f.p.correct} Correct / {f.p.incorrect} Incorrect</span>
                      <span>Total: {f.p.answered}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Finish a test to see this.</div>
            )}
          </div>
        ))}
      </Card>

      <Card title="Score Trend by Folder" className="mb-8">
        <MultiLine series={[...trend.entries()].map(([name, points]) => ({ name, points }))} />
      </Card>

      <Card title="Recent Test Activity" testId="reports-recent">
        <div className="eyebrow mb-3">Last 5 test scores</div>
        <ScoreBars rows={done.slice(-5).map((t) => ({ name: t.name, pct: scoreAttempt(t).pct }))} />
      </Card>
    </div>
  );
}
