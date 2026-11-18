import { useEffect, useMemo, useState } from 'react';
import { db } from '../db';
import type { Attempt, Exam } from '../types';
import { classifyChange, isBlank, isCorrect, scoreAttempt } from '../lib/score';
import { downloadBlob, downloadText, toCsv } from '../lib/csv';
import { exportBackup } from '../lib/backup';
import { fmtDuration } from '../lib/timer';
import { examPdf, type PdfDoc } from '../lib/pdf';
import { saveAttempt } from '../lib/store';
import { fmtDateTime, useLive } from '../ui/hooks';
import { TimeChart } from '../ui/charts';
import { IconFlag } from '../ui/icons';
import { MISS_REASONS } from '../types';
import { Donut } from '../ui/ScoreBar';
import { ExportPdfDialog } from '../ui/ExportPdfDialog';
import { HBars } from '../ui/paperCharts';
import { PaperModal } from '../ui/PaperModal';
import { QuestionView } from '../ui/QuestionView';
import { backupFileName, useFolderStatus } from './Home';

const clock = (ms: number) => {
  const t = Math.round(ms / 1000);
  const h = Math.floor(t / 3600);
  return `${h ? `${h}h:` : ''}${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}m:${String(t % 60).padStart(2, '0')}s`;
};
type Section = 'overview' | 'review' | 'subjects';
type RFilter = 'all' | 'incorrect' | 'correct' | 'marked';

/** One question in the "Question Review" list: folds open to show the page, the answers and the explanation. */
function ReviewRow({ a, i, exams }: { a: Attempt; i: number; exams: Map<string, Exam> }) {
  const it = a.items[i];
  const exam = exams.get(it.examId);
  const q = exam?.questions.find((x) => x.id === it.qid);
  const [open, setOpen] = useState(false);
  const [expl, setExpl] = useState(false);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const texts = useLive(async () => (open && exam ? await db.pages.where('examId').equals(exam.id).toArray() : []), [open, exam?.id]);
  const textMap = useMemo(() => new Map((texts ?? []).map((t) => [t.page, t])), [texts]);
  useEffect(() => {
    if (open && exam && !doc) examPdf(exam.id).then(setDoc, () => {});
  }, [open, exam?.id]);
  const r = isBlank(it) ? 'omitted' : isCorrect(it) ? 'correct' : 'incorrect';
  const col = r === 'correct' ? 'var(--good)' : r === 'incorrect' ? 'var(--bad)' : 'var(--ink-2)';
  const toggleMark = async () => {
    const fresh = await db.attempts.get(a.id);
    if (!fresh) return;
    fresh.items[i] = { ...fresh.items[i], marked: !fresh.items[i].marked };
    await saveAttempt(fresh);
  };
  return (
    <div className="mb-3 border-2" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }} data-testid={`report-row-${i + 1}`} data-result={r === 'omitted' ? 'blank' : r}>
      <button className="flex w-full items-center gap-3 px-8 py-6 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="serif text-[16px]">Question {i + 1}{exam ? <span style={{ color: 'var(--ink-2)' }}> · {exam.name} Q{it.number}</span> : null}</span>
        <span className="mono border px-1.5 py-0.5 text-[10px] uppercase" style={{ color: col, borderColor: col }}>{r}</span>
        <span className="mono text-[12px]" style={{ color: 'var(--ink-2)' }}>◷ {clock(it.timeMs)}</span>
        {it.marked && <IconFlag size={12} />}
        <span className="ml-auto" style={{ color: 'var(--ink-2)' }}>{open ? '⌃' : '⌄'}</span>
      </button>
      {open && (
        <div className="px-8 pb-6">
          <div className="mb-3 flex items-center justify-end gap-3 text-[13px]">
            <button className="flex items-center gap-1 font-semibold" onClick={() => void toggleMark()} data-testid="row-mark">
              <IconFlag size={12} /> {it.marked ? 'Unmark' : 'Mark'}
            </button>
            <a className="link" href={`#/review/${a.id}?i=${i}`}>Open in review →</a>
          </div>
          <dl className="mono mb-4 grid grid-cols-[70px_1fr] gap-y-1 text-[12px]">
            <dt style={{ color: 'var(--ink-2)' }}>FOLDER</dt>
            <dd className="font-semibold">{exam?.subject?.trim() || 'No folder'}</dd>
            <dt style={{ color: 'var(--ink-2)' }}>EXAM</dt>
            <dd className="font-semibold">{exam?.name ?? 'Deleted exam'}</dd>
            <dt style={{ color: 'var(--ink-2)' }}>Q #</dt>
            <dd>{it.number}</dd>
          </dl>
          <div className="mb-4 overflow-x-auto">{doc && exam && q ? <QuestionView exam={exam} question={q} doc={doc} texts={textMap} width={620} readOnly revealKey={it.key ?? ''} item={it} /> : <div className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{exam ? 'Loading the page…' : 'This exam is no longer in the library.'}</div>}</div>
          <div className="mono mb-3 text-[13px]">
            Your answer: <b style={{ color: col }}>{it.answer ?? '—'}</b> · Correct answer: <b style={{ color: 'var(--good)' }}>{it.key ?? q?.answer ?? '—'}</b>
            {classifyChange(it) && <> · changed {classifyChange(it)}</>}
          </div>
          <div className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <button className="link text-[14px]" onClick={() => setExpl((e) => !e)}>{expl ? 'Hide Explanation ⌃' : 'Show Explanation ⌄'}</button>
            {expl && <div className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed">{q?.explanation?.trim() || 'No explanation was found in the answer key for this question.'}</div>}
            {it.reviewNote?.trim() && <div className="mt-3 border-l-4 pl-3 text-[13px]" style={{ borderColor: 'var(--brand)' }}><b>My note:</b> {it.reviewNote}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function Report({ attemptId }: { attemptId: string }) {
  const a = useLive(() => db.attempts.get(attemptId).then((x) => x ?? null), [attemptId]);
  const examList = useLive(async () => (a ? (await db.exams.bulkGet([...new Set(a.items.map((i) => i.examId))])).filter((e): e is Exam => !!e) : []), [a?.id]);
  const folder = useFolderStatus();
  const [section, setSection] = useState<Section>('overview');
  const [rf, setRf] = useState<RFilter>('all');
  const [msg, setMsg] = useState('');
  const [pdf, setPdf] = useState(false);
  const [content, setContent] = useState(false);
  const [naming, setNaming] = useState(false);
  const [nm, setNm] = useState('');
  if (a === undefined || examList === undefined) return <div className="text-sm">Loading…</div>;
  if (a === null) return <div>This attempt was not found. <a className="link" href="#/history">Back to Test History</a></div>;
  if (a.status !== 'completed') return <div>This block is not finished yet. <a className="link" href={`#/test/${a.id}`}>Resume it</a></div>;
  const exams = new Map(examList.map((e) => [e.id, e]));
  const s = scoreAttempt(a);
  const ungraded = a.items.filter((i) => !i.key).length;
  const took = a.blocks.reduce((n, b) => n + b.timer.elapsedMs, 0);
  const isTimed = a.blocks.some((b) => b.limitMs != null);
  const csv = () => {
    const rows: (string | number | null)[][] = [['Question', 'Exam question #', 'My answer', 'Correct answer', 'Result', 'Time (s)', 'Marked', 'Answer change', 'Reason for miss', 'Test note', 'Review note']];
    a.items.forEach((it, i) =>
      rows.push([i + 1, it.number, it.answer ?? '', it.key ?? '', isBlank(it) ? 'omitted' : isCorrect(it) ? 'correct' : 'incorrect', Math.round(it.timeMs / 1000), it.marked ? 'yes' : '', classifyChange(it) ?? '', MISS_REASONS.find((r) => r.id === it.missReason)?.label ?? '', it.note, it.reviewNote]),
    );
    downloadText(toCsv(rows), `test-simulator-results-${new Date(a.completedAt ?? Date.now()).toISOString().slice(0, 10)}.csv`);
  };
  const saveName = async () => {
    const fresh = await db.attempts.get(a.id);
    if (fresh && nm.trim()) await saveAttempt({ ...fresh, name: nm.trim() });
    setNaming(false);
  };
  const counts = { all: a.items.length, incorrect: a.items.filter((i) => !isBlank(i) && !isCorrect(i)).length, correct: a.items.filter(isCorrect).length, marked: a.items.filter((i) => i.marked).length };
  const visible = a.items.map((it, i) => ({ it, i })).filter(({ it }) => (rf === 'all' ? true : rf === 'incorrect' ? !isBlank(it) && !isCorrect(it) : rf === 'correct' ? isCorrect(it) : it.marked));
  // results per folder and per exam
  const groupBy = (key: (examId: string) => string) => {
    const m = new Map<string, { c: number; t: number; ms: number }>();
    for (const it of a.items) {
      const k = key(it.examId);
      const g = m.get(k) ?? { c: 0, t: 0, ms: 0 };
      g.t++;
      g.ms += it.timeMs;
      if (isCorrect(it)) g.c++;
      m.set(k, g);
    }
    return [...m.entries()];
  };
  const byFolder = groupBy((id) => exams.get(id)?.subject?.trim() || 'No folder');
  const byExam = groupBy((id) => exams.get(id)?.name ?? 'Deleted exam');
  const navBtn = (id: Section, label: string) => (
    <button className="block w-full px-2.5 py-2 text-left text-[14px] font-semibold" style={section === id ? { background: 'var(--navy)', color: 'var(--bg)' } : { color: 'var(--ink-2)' }} onClick={() => setSection(id)} data-testid={`section-${id}`}>
      {label}
    </button>
  );

  return (
    <div data-testid="report">
      {pdf && <ExportPdfDialog attempt={a} onClose={() => setPdf(false)} />}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b-2 pb-6" style={{ borderColor: 'var(--line)' }}>
        <div className="min-w-0">
          <a className="link text-[14px]" href="#/history">← Return to History Ledger</a>
          <div className="flex flex-wrap items-end gap-10">
            <h1 className="mt-1 text-[36px] font-bold leading-[40px]">Examination<br />Report</h1>
          </div>
          {naming ? (
            <form className="mt-1 flex gap-1" onSubmit={(e) => { e.preventDefault(); void saveName(); }}>
              <input className="field py-1 text-[13px]" autoFocus value={nm} maxLength={100} onChange={(e) => setNm(e.target.value)} onBlur={() => void saveName()} data-testid="report-name-input" />
            </form>
          ) : (
            <button className="mt-1 block text-[14px]" style={{ color: 'var(--ink-2)' }} onClick={() => { setNm(a.name); setNaming(true); }} data-testid="report-name">✎ {a.name || 'Add a name'}</button>
          )}
          <ul className="mono mt-1 text-[13px]" style={{ color: 'var(--ink)' }}>
            <li>• Date: {fmtDateTime(a.completedAt)}</li>
            <li>• Total Time Taken: {clock(took)}</li>
            <li>• Answer Time: {clock(s.timeMs)}</li>
          </ul>
        </div>
        <div className="flex flex-col items-end gap-4">
          <div className="text-right">
            <div className="serif text-[12px]">Final Score</div>
            <div className="mono text-[36px] font-bold leading-none" style={{ color: 'var(--ink)' }} data-testid="score-pct">{s.pct.toFixed(1)}%</div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <a className="btn btn-caps" href={`#/review/${a.id}?filter=incorrect`} data-testid="review-incorrect">Find incorrect questions</a>
            <a className="btn btn-caps" href={`#/review/${a.id}`}>All questions</a>
            <button className="btn btn-caps" onClick={() => setPdf(true)} data-testid="report-pdf">Export PDF</button>
            <button className="btn btn-caps" onClick={csv} data-testid="report-csv">CSV</button>
            <a className="btn-primary btn-caps" href={`#/review/${a.id}`} data-testid="review-all">Review in test mode</a>
          </div>
        </div>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[220px_1fr]">
        <div className="space-y-6">
          <div className="p-4" style={{ background: 'var(--surface-2)', border: '2px solid var(--line)' }}>
            <div className="mb-3 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Report Sections</div>
            {navBtn('overview', 'Report Overview')}
            {navBtn('review', 'Question Review')}
            {navBtn('subjects', 'Subject Analysis')}
          </div>
          <div className="p-4" style={{ background: 'var(--surface-2)', border: '2px solid var(--line)' }} data-testid="dossier">
            <div className="mb-3 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Test Dossier</div>
            <dl className="mono space-y-1.5 text-[12px]">
              {(
                [
                  ['Exam:', a.examId ? (exams.get(a.examId)?.name ?? 'Deleted') : `${exams.size} exams`, undefined],
                  ['Mode:', <span key="m" className="badge-mode">{a.mode === 'tutor' ? 'Tutor' : 'Test'} · {isTimed ? 'Timed' : 'Untimed'}</span>, undefined],
                  ['Total Time:', clock(took), undefined],
                  ['Answer Time:', clock(s.timeMs), undefined],
                  ['Answered:', `${s.total - s.blank} / ${s.total}`, undefined],
                  ['Correct:', <b key="c" data-testid="score-correct">{s.correct}</b>, 'var(--good)'],
                  ['Incorrect:', <b key="w" data-testid="score-wrong">{s.wrong}</b>, 'var(--bad)'],
                  ['Omitted:', <b key="b" data-testid="score-blank">{s.blank}</b>, undefined],
                ] as [string, React.ReactNode, string | undefined][]
              ).map(([k, v, c]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt>{k}</dt>
                  <dd className="text-right font-bold" style={{ color: c }}>{v}</dd>
                </div>
              ))}
            </dl>
            <button className="btn mt-4 w-full" onClick={() => setContent(true)} data-testid="content-list">☰ Folders/Exams List</button>
          </div>
        </div>

        <div className="min-w-0">
          {ungraded > 0 && <div className="mb-4 border-2 p-3 text-[13px]" style={{ borderColor: 'var(--warn)' }}>{ungraded} question{ungraded === 1 ? ' has' : 's have'} no answer in the key and count as not correct. Add them under “Edit answer key” and this report updates.</div>}
          {section === 'overview' && (
            <div className="space-y-6">
              <section className="card p-6" data-testid="response-sheet">
                <h3 className="mb-5 text-[16px] font-normal">Response Sheet</h3>
                <div className="flex flex-wrap gap-3">
                  {a.items.map((it, i) => {
                    const r = isBlank(it) ? 'blank' : isCorrect(it) ? 'correct' : 'incorrect';
                    return (
                      <a key={i} href={`#/review/${a.id}?i=${i}`} className="mono flex h-[42px] w-[42px] items-center justify-center text-[12px] font-bold text-white hover:opacity-80" title={`Question ${i + 1}: ${r}${it.marked ? ' (marked)' : ''}`} style={{ background: r === 'correct' ? 'var(--good)' : r === 'incorrect' ? 'var(--bad)' : '#9aa5ae', outline: it.marked ? '2px solid #d97706' : undefined, outlineOffset: 1 }}>
                        {i + 1}
                      </a>
                    );
                  })}
                </div>
              </section>
              <section className="card p-6" data-testid="analysis">
                <h3 className="mb-5 text-[16px] font-normal">Test Analysis</h3>
                <div className="grid items-center gap-8 md:grid-cols-3">
                  <div className="flex items-center gap-5">
                    <Donut correct={s.correct} wrong={s.wrong} blank={s.blank} />
                    <div className="mono text-[12px]">
                      <div style={{ color: 'var(--good)' }}>{s.correct} correct</div>
                      <div style={{ color: 'var(--bad)' }}>{s.wrong} incorrect</div>
                      <div style={{ color: 'var(--ink-2)' }}>{s.blank} omitted</div>
                    </div>
                  </div>
                  <div className="mono text-[12px]" data-testid="changes">
                    <div className="eyebrow mb-2">Answer changes</div>
                    <div className="flex justify-between"><span>Correct → Incorrect</span><b data-testid="chg-rw">{s.changes['right→wrong']}</b></div>
                    <div className="flex justify-between"><span>Incorrect → Correct</span><b data-testid="chg-wr">{s.changes['wrong→right']}</b></div>
                    <div className="flex justify-between"><span>Incorrect → Incorrect</span><b>{s.changes['wrong→wrong']}</b></div>
                  </div>
                  <div className="mono text-[12px]">
                    <div className="eyebrow mb-2">Time</div>
                    <div className="flex justify-between"><span>Average per question</span><b>{fmtDuration(s.avgMs)}</b></div>
                    <div className="flex justify-between"><span>Marked</span><b>{counts.marked}</b></div>
                  </div>
                </div>
                <div className="eyebrow mb-2 mt-6">Time per question</div>
                <TimeChart times={s.times} />
              </section>
            </div>
          )}
          {section === 'review' && (
            <div data-testid="question-review">
              <div className="mb-1 inline-flex border-2" style={{ borderColor: 'var(--line)' }}>
                {(
                  [
                    ['all', 'All', undefined],
                    ['incorrect', 'Incorrect', 'var(--bad)'],
                    ['correct', 'Correct', 'var(--good)'],
                    ['marked', 'Marked', '#d97706'],
                  ] as [RFilter, string, string | undefined][]
                ).map(([k, l, c]) => (
                  <button key={k} className="flex items-center gap-2 px-4 py-1.5 text-[13px] font-semibold" style={rf === k ? { background: 'var(--navy)', color: 'var(--bg)' } : { background: 'var(--surface)', color: 'var(--ink)' }} onClick={() => setRf(k)} data-testid={`rf-${k}`} disabled={!counts[k]}>
                    {c && <span className="h-2.5 w-2.5" style={{ background: c }} />}
                    {l} <span className="mono text-[11px] opacity-70">{counts[k]}</span>
                  </button>
                ))}
              </div>
              <div className="mono mb-4 text-[11px]" style={{ color: 'var(--ink-2)' }}>
                Showing {visible.length} of {s.total} questions
              </div>
              {visible.map(({ i }) => (
                <ReviewRow key={i} a={a} i={i} exams={exams} />
              ))}
            </div>
          )}
          {section === 'subjects' && (
            <section className="card p-6" data-testid="subject-analysis">
              <h3 className="mb-5 text-[16px] font-normal">Subject Performance Analysis</h3>
              {(
                [
                  ['By folder', byFolder],
                  ['By exam', byExam],
                ] as const
              ).map(([title, list]) => (
                <div key={title} className="mb-6">
                  <div className="eyebrow mb-3">{title}</div>
                  {list.map(([name, g]) => (
                    <div key={name} className="mb-4 px-4">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="serif text-[15px] font-bold">
                          {name} <span className="text-[12px] font-normal" style={{ color: 'var(--ink-2)' }}>({clock(g.ms)})</span>
                        </span>
                        <span className="mono text-[12px]">
                          {g.c} / {g.t} <b className="text-[14px]">{Math.round((g.c / Math.max(1, g.t)) * 100)}%</b>
                        </span>
                      </div>
                      <div className="flex h-1.5">
                        <span style={{ width: `${(g.c / Math.max(1, g.t)) * 100}%`, background: 'var(--good)' }} />
                        <span style={{ flex: 1, background: 'var(--bad)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {s.byTag.length > 0 && (
                <div>
                  <div className="eyebrow mb-3">By tag</div>
                  <HBars rows={s.byTag.map((t) => ({ name: `${t.label} (${t.correct}/${t.total})`, value: t.total ? (t.correct / t.total) * 100 : null }))} />
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {content && (
        <PaperModal title="Test Content Details" onClose={() => setContent(false)} width={720} footer={<button className="btn" onClick={() => setContent(false)}>Close</button>}>
          <div className="grid gap-6 sm:grid-cols-2">
            {(
              [
                ['Folders', byFolder],
                ['Exams', byExam],
              ] as const
            ).map(([t, list]) => (
              <div key={t}>
                <div className="eyebrow mb-2 border-b pb-1" style={{ borderColor: 'var(--line)' }}>{t}</div>
                {list.map(([n, g]) => (
                  <div key={n} className="flex justify-between gap-2 py-1 text-[13px] font-semibold">
                    <span className="truncate">{n}</span>
                    <span className="mono">{g.t}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </PaperModal>
      )}

      {!folder.connected && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-2 p-3 text-[13px]" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }} data-testid="backup-offer">
          This test is saved on this device. Keep a copy somewhere safe:
          <button className="btn btn-sm" data-testid="report-backup" onClick={async () => { setMsg('Preparing…'); downloadBlob(await exportBackup(), backupFileName()); setMsg('Backup saved to Downloads.'); }}>
            Back up now
          </button>
          {msg && <span>{msg}</span>}
        </div>
      )}
    </div>
  );
}
