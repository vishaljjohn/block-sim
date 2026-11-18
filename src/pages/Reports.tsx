import { useMemo, useState } from 'react';
import { db } from '../db';
import { scoreAttempt } from '../lib/score';
import { assessment, fmtHours, folderStats, progressOf, questionStats, scoreSeries, studyByDay, timeStudied } from '../lib/stats';
import { useLive } from '../ui/hooks';
import { H1 } from '../ui/Shell';
import { AreaChart, DayBars, HBars, Sparkline } from '../ui/paperCharts';

const DAY = 86_400_000;
type Range = '7' | '30' | '90' | 'all';

function Kpi({ label, value, sub, extra, testId }: { label: string; value: string; sub: string; extra?: React.ReactNode; testId?: string }) {
  return (
    <div className="card p-5" data-testid={testId}>
      <div className="eyebrow mb-2">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <div className="mono text-[30px] font-bold leading-none">{value}</div>
        {extra}
      </div>
      <div className="mt-2 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>{sub}</div>
    </div>
  );
}

function Section({ title, children, testId, right }: { title: string; children: React.ReactNode; testId?: string; right?: React.ReactNode }) {
  return (
    <section className="card p-6" data-testid={testId}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="serif text-[13px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--ink-2)' }}>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Reports() {
  const allAttempts = useLive(() => db.attempts.toArray(), []);
  const exams = useLive(() => db.exams.toArray(), []);
  const [range, setRange] = useState<Range>('30');
  const [examId, setExamId] = useState('');
  const now = Date.now();
  const since = range === 'all' ? 0 : now - Number(range) * DAY;
  const attempts = useMemo(() => (allAttempts ?? []).filter((a) => (a.completedAt ?? a.updatedAt) >= since), [allAttempts, since]);
  const qs = useMemo(() => questionStats(attempts), [attempts]);
  if (!allAttempts || !exams) return <div className="text-sm">Loading…</div>;

  const pool = examId ? exams.filter((e) => e.id === examId) : exams.filter((e) => !e.isDemo).length ? exams.filter((e) => !e.isDemo) : exams;
  const p = progressOf(pool.flatMap((e) => e.questions.map((q) => q.id)), qs);
  const series = scoreSeries(attempts, examId || undefined);
  const a = assessment(p.accuracy);
  const week = studyByDay(allAttempts, 7, now);
  const thisWeek = timeStudied(allAttempts, examId || undefined, now - 7 * DAY);
  const lastWeek = timeStudied(allAttempts, examId || undefined, now - 14 * DAY) - thisWeek;
  const days = range === 'all' ? Math.max(1, Math.ceil((now - Math.min(now, ...allAttempts.map((x) => x.createdAt))) / DAY)) : Number(range);
  const studied = timeStudied(attempts, examId || undefined);
  const folders = folderStats(pool, qs);
  const ranked = folders.filter((f) => f.p.accuracy != null && f.p.answered >= 5).sort((x, y) => (y.p.accuracy ?? 0) - (x.p.accuracy ?? 0));
  const strengths = ranked.filter((f) => (f.p.accuracy ?? 0) >= 70).slice(0, 5);
  const focus = [...ranked].reverse().filter((f) => (f.p.accuracy ?? 0) < 70).slice(0, 5);
  const recent = attempts.filter((x) => x.status === 'completed' && (!examId || x.examId === examId)).sort((x, y) => (y.completedAt ?? 0) - (x.completedAt ?? 0)).slice(0, 8);
  const toneColor = a.tone === 'good' ? 'var(--good)' : a.tone === 'bad' ? 'var(--bad)' : a.tone === 'mid' ? 'var(--warn)' : 'var(--ink-3)';
  const trend = series.length >= 2 ? series[series.length - 1].pct - series[0].pct : null;

  return (
    <div data-testid="reports">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <H1 sub="How your practice is going, computed on this device.">Performance Folio</H1>
        <div className="flex flex-wrap gap-2">
          <select className="field" value={range} onChange={(e) => setRange(e.target.value as Range)} data-testid="reports-range">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <select className="field" value={examId} onChange={(e) => setExamId(e.target.value)} data-testid="reports-exam">
            <option value="">All exams</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Overall score" value={p.accuracy == null ? '—' : `${Math.round(p.accuracy)}%`} sub={`${p.correct} correct of ${p.answered} answered`} extra={<Sparkline values={series.map((s) => s.pct)} />} testId="kpi-score" />
        <Kpi label="Questions answered" value={String(p.answered)} sub={`${Math.round(p.completedPct)}% of ${p.total} questions seen`} testId="kpi-answered" />
        <Kpi label="Avg daily study" value={fmtHours(studied / days)} sub={`${fmtHours(studied)} in this period`} testId="kpi-daily" />
        <Kpi label="This week" value={fmtHours(thisWeek)} sub={lastWeek > 0 ? `${thisWeek >= lastWeek ? '▲' : '▼'} vs ${fmtHours(lastWeek)} last week` : 'No study the week before'} testId="kpi-week" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Section title="Score over time" testId="reports-trend" right={trend != null && <span className="mono text-[12px]" style={{ color: trend >= 0 ? 'var(--good)' : 'var(--bad)' }}>{trend >= 0 ? '+' : ''}{Math.round(trend)} pts</span>}>
            <AreaChart points={series.map((s) => ({ x: new Date(s.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), y: s.pct }))} />
          </Section>
          <Section title="Progress overview by folder" testId="reports-folders">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="eyebrow mb-3">Completion</div>
                <HBars rows={folders.map((f) => ({ name: f.name, value: f.p.completedPct }))} empty="Import exams into folders to compare them." />
              </div>
              <div>
                <div className="eyebrow mb-3">Correct</div>
                <HBars rows={folders.map((f) => ({ name: f.name, value: f.p.accuracy }))} empty="Finish a block to see this." />
              </div>
            </div>
          </Section>
          <Section title="Recent test activity" testId="reports-recent">
            {recent.length ? (
              <div>
                {recent.map((r) => {
                  const s = scoreAttempt(r);
                  return (
                    <a key={r.id} href={`#/report/${r.id}`} className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0 hover:underline" style={{ borderColor: 'var(--line)' }}>
                      <span className="truncate">{r.name}</span>
                      <span className="mono shrink-0 text-[12px]" style={{ color: 'var(--ink-2)' }}>
                        {new Date(r.completedAt ?? 0).toLocaleDateString()} · <b style={{ color: s.pct >= 70 ? 'var(--good)' : s.pct >= 50 ? 'var(--warn)' : 'var(--bad)' }}>{Math.round(s.pct)}%</b>
                      </span>
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm" style={{ color: 'var(--ink-3)' }}>No finished tests in this period.</div>
            )}
          </Section>
        </div>
        <div className="space-y-6">
          <section className="card accent-top p-6" data-testid="reports-readiness">
            <div className="eyebrow mb-2">Readiness</div>
            <span className="pill mb-2" style={{ color: toneColor }}>{a.label}</span>
            <p className="text-[14px] leading-snug" style={{ color: 'var(--ink-2)' }}>{a.text}</p>
          </section>
          <Section title="Study time this week" testId="reports-days">
            <DayBars days={week.map((d) => ({ label: new Date(d.day).toLocaleDateString(undefined, { weekday: 'short' }), hours: d.ms / 3_600_000 }))} />
          </Section>
          <Section title="Strengths">
            {strengths.length ? strengths.map((f) => <Line key={f.name} name={f.name} v={f.p.accuracy} c="var(--good)" />) : <Empty />}
          </Section>
          <Section title="Areas for focus">
            {focus.length ? focus.map((f) => <Line key={f.name} name={f.name} v={f.p.accuracy} c="var(--bad)" />) : <Empty />}
          </Section>
        </div>
      </div>
    </div>
  );
}

const Line = ({ name, v, c }: { name: string; v: number | null; c: string }) => (
  <div className="flex justify-between gap-2 py-1 text-[14px]">
    <span className="truncate">{name}</span>
    <b className="mono text-[12.5px]" style={{ color: c }}>{v == null ? '—' : `${Math.round(v)}%`}</b>
  </div>
);
const Empty = () => <div className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Needs at least 5 answered questions in a folder.</div>;
