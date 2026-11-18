import { useMemo, useState } from 'react';
import { db } from '../db';
import { setActiveExam, useActiveExamId } from '../lib/activeExam';
import { buildMissedBank, dueRows } from '../lib/missed';
import { assessment, folderStats, fmtHours, progressOf, questionStats, scoreSeries, timeStudied } from '../lib/stats';
import { go, useLive } from '../ui/hooks';
import { H1 } from '../ui/Shell';
import { AreaChart, HBars, Radar, TripleBar } from '../ui/paperCharts';

function Stat({ label, value, sub, color, testId }: { label: string; value: string; sub?: React.ReactNode; color?: string; testId?: string }) {
  return (
    <div data-testid={testId}>
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="mono text-[36px] font-black leading-none" style={{ color: color ?? 'var(--ink)' }}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>{sub}</div>}
    </div>
  );
}

export function Dashboard() {
  const exams = useLive(() => db.exams.toArray(), []);
  const attempts = useLive(() => db.attempts.toArray(), []);
  const reviews = useLive(() => db.reviews.toArray(), []);
  const activeId = useActiveExamId();
  const [radar, setRadar] = useState<'folders' | 'exams'>('folders');
  const qs = useMemo(() => questionStats(attempts ?? []), [attempts]);
  if (!exams || !attempts || !reviews) return <div className="text-sm">Loading…</div>;

  const real = exams.filter((e) => !e.isDemo);
  const exam = exams.find((e) => e.id === activeId) ?? real[0] ?? exams[0];
  if (!exam) {
    return (
      <div data-testid="dashboard">
        <H1 sub="Your current standing and progress.">Dashboard</H1>
        <div className="card flex flex-col items-center p-12 text-center">
          <div className="serif mb-2 text-xl font-bold">No exams yet</div>
          <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>Import a practice exam PDF (or a whole folder of them) to get started.</p>
          <div className="flex gap-2">
            <a className="btn-primary" href="#/import">Import an exam</a>
            <a className="btn" href="#/import?folder=1">Import a folder</a>
          </div>
        </div>
      </div>
    );
  }
  const p = progressOf(exam.questions.map((q) => q.id), qs);
  const a = assessment(p.accuracy);
  const series = scoreSeries(attempts, exam.id).map((s) => ({ x: new Date(s.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), y: s.pct }));
  const folders = folderStats(real.length ? real : exams, qs);
  const examRows = (real.length ? real : exams).map((e) => ({ name: e.name, p: progressOf(e.questions.map((q) => q.id), qs) }));
  const radarItems = (radar === 'folders' ? folders : examRows).map((f) => ({ name: f.name, value: f.p.accuracy }));
  const attention = folders.filter((f) => f.p.accuracy != null && f.p.accuracy < 60).sort((x, y) => (x.p.accuracy ?? 0) - (y.p.accuracy ?? 0)).slice(0, 4);
  const focus = folders.filter((f) => !attention.includes(f)).sort((x, y) => x.p.completedPct - y.p.completedPct).slice(0, 4);
  const dueList = dueRows(buildMissedBank(attempts, reviews), Date.now());
  const open = attempts.filter((x) => x.status === 'active' && x.examId === exam.id).sort((x, y) => y.updatedAt - x.updatedAt)[0];
  const toneColor = a.tone === 'good' ? 'var(--good)' : a.tone === 'bad' ? 'var(--bad)' : a.tone === 'mid' ? 'var(--warn)' : 'var(--ink-3)';

  return (
    <div data-testid="dashboard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <H1 sub="Your current standing and progress.">Dashboard</H1>
        <div className="flex gap-2">
          {open && <a className="btn" href={`#/test/${open.id}`} data-testid="dash-resume">Resume test</a>}
          <a className="btn-primary" href={`#/setup?exam=${exam.id}`} data-testid="dash-new-test">+ New Test</a>
          <a className="btn" href="#/exams" data-testid="dash-switch">⇄ Switch Exam</a>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {/* the exam on your desk */}
          <section className="card accent-top p-8" data-testid="dash-exam">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-[24px] font-bold leading-tight">{exam.name}</h2>
                <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-2)' }}>
                  {exam.subject ? `${exam.subject} · ` : ''}
                  {exam.questions.length} questions · {exam.pageCount} pages
                  {!exam.keyChecked && <span className="pill ml-2" style={{ color: 'var(--warn)' }}>check the answer key</span>}
                </p>
              </div>
              <div className="text-right">
                <div className="eyebrow-mono">Time studied</div>
                <div className="mono text-[18px] font-bold">{fmtHours(timeStudied(attempts, exam.id))}</div>
              </div>
            </div>
            <div className="my-6">
              <TripleBar correct={p.correct} incorrect={p.incorrect} remaining={p.remaining + p.omitted} testId="dash-progress" />
            </div>
            <div className="grid grid-cols-2 gap-6 border-t pt-6 md:grid-cols-4" style={{ borderColor: 'var(--line)' }}>
              <Stat label="Overall accuracy" value={p.accuracy == null ? '—' : `${Math.round(p.accuracy)}%`} sub={`${Math.round(p.completedPct)}% completed`} color="var(--brand)" testId="dash-accuracy" />
              <Stat label="Answered" value={String(p.answered)} sub={`of ${p.total} questions`} />
              <Stat label="Blocks" value={String(attempts.filter((x) => x.status === 'completed' && x.examId === exam.id).length)} sub="finished" />
              <div>
                <div className="eyebrow mb-1">Assessment</div>
                <span className="pill mb-1.5" style={{ color: toneColor }}>{a.label}</span>
                <div className="text-[13px] leading-snug" style={{ color: 'var(--ink-2)' }}>{a.text}</div>
              </div>
            </div>
          </section>

          {/* trend + priorities */}
          <section className="card p-8">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="serif text-[12px] font-bold uppercase tracking-[0.6px]" style={{ color: 'var(--ink-2)' }}>Score over time</h3>
              <a className="link text-sm" href="#/reports">Full Reports ↗</a>
            </div>
            <div className="border p-3" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
              <AreaChart points={series} height={200} />
            </div>
            <h3 className="serif mb-3 mt-7 text-[12px] font-bold uppercase tracking-[0.6px]" style={{ color: 'var(--ink-2)' }}>Subject priority matrix</h3>
            <div className="grid gap-3 md:grid-cols-2" data-testid="dash-priority">
              <div className="border p-4" style={{ borderColor: '#f3c4c4', background: 'color-mix(in srgb, #fee2e2 50%, var(--surface))' }}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="mono text-[12px] font-bold uppercase" style={{ color: 'var(--bad)' }}>⚠ Needs attention</span>
                  <span className="text-[11px]" style={{ color: 'var(--bad)' }}>Low score</span>
                </div>
                {attention.length ? attention.map((f) => <PRow key={f.name} name={f.name} pct={f.p.accuracy} n={f.p.answered} color="var(--bad)" />) : <div className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Nothing under 60% yet.</div>}
              </div>
              <div className="border p-4" style={{ borderColor: '#f3dfb4', background: 'color-mix(in srgb, #fef3c7 50%, var(--surface))' }}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="mono text-[12px] font-bold uppercase" style={{ color: 'var(--warn)' }}>◎ Focus next</span>
                  <span className="text-[11px]" style={{ color: 'var(--warn)' }}>Needs more practice</span>
                </div>
                {focus.length ? focus.map((f) => <PRow key={f.name} name={f.name} pct={f.p.completedPct} n={f.p.answered} color="var(--warn)" />) : <div className="text-[13px]" style={{ color: 'var(--ink-3)' }}>Import more exams to compare.</div>}
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-8" data-testid="dash-radar">
            <h3 className="text-[20px] font-bold">Competency Radar</h3>
            <div className="eyebrow-mono mt-1">Accuracy by {radar === 'folders' ? 'folder' : 'exam'}</div>
            <div className="tabs mt-4">
              <button className={radar === 'folders' ? 'on' : ''} onClick={() => setRadar('folders')}>Folders</button>
              <button className={radar === 'exams' ? 'on' : ''} onClick={() => setRadar('exams')}>Exams</button>
            </div>
            <div className="mt-4">
              {radarItems.length >= 3 ? <Radar items={radarItems.slice(0, 10)} /> : <HBars rows={radarItems.map((r) => ({ name: r.name, value: r.value }))} />}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 border-t pt-3 text-[11.5px]" style={{ borderColor: 'var(--line)' }}>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={{ background: 'var(--good)' }} /> Strong (≥80%)</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={{ background: 'var(--ink)' }} /> Average (60–79%)</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={{ background: 'var(--bad)' }} /> Weak (&lt;60%)</span>
            </div>
          </section>

          <section className="card p-8" data-testid="dash-queue">
            <h3 className="text-[18px] font-bold">Review Queue</h3>
            <div className="my-4 text-center" data-testid={dueList.length ? 'due-card' : undefined}>
              <div className="mono text-[44px] font-bold leading-none" data-testid="due-count">{dueList.length}</div>
              <div className="mt-1 text-[13px]" style={{ color: 'var(--ink-2)' }}>missed question{dueList.length === 1 ? '' : 's'} due today</div>
            </div>
            {dueList.length ? (
              <button className="btn-accent w-full" data-testid="due-start" onClick={() => go(`/redo?q=${dueList.slice(0, 40).map((r) => encodeURIComponent(r.qid)).join(',')}`)}>
                Begin session ({Math.min(dueList.length, 40)}) →
              </button>
            ) : (
              <a className="btn w-full" href="#/queue">Open the review queue</a>
            )}
          </section>

          <section className="card p-8">
            <h3 className="mb-3 text-[18px] font-bold">Your Exams</h3>
            <div className="space-y-1.5 text-[13.5px]">
              {(real.length ? real : exams).slice(0, 6).map((e) => (
                <button key={e.id} className="flex w-full items-center justify-between gap-2 text-left hover:underline" onClick={() => setActiveExam(e.id)} style={e.id === exam.id ? { color: 'var(--brand)', fontWeight: 600 } : undefined}>
                  <span className="truncate">{e.name}</span>
                  <span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>{e.subject || ''}</span>
                </button>
              ))}
            </div>
            <a className="link mt-3 block text-sm" href="#/exams">All exams →</a>
          </section>
        </div>
      </div>
    </div>
  );
}

function PRow({ name, pct, n, color }: { name: string; pct: number | null; n: number; color: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-[14px]">
      <span className="truncate">{name}</span>
      <span className="mono shrink-0 text-[12px]">
        <b style={{ color }}>{pct == null ? '—' : `${Math.round(pct)}%`}</b> <span style={{ color: 'var(--ink-3)' }}>{n}q</span>
      </span>
    </div>
  );
}
