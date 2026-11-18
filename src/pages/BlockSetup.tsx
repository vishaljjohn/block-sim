import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SEC_PER_Q, STORAGE_PREFIX } from '../config';
import { db } from '../db';
import type { Exam, Mode } from '../types';
import { createAttempt, planBlocks, shuffle, type Pick } from '../lib/attempt';
import { buildMissedBank } from '../lib/missed';
import { saveAttempt } from '../lib/store';
import { fmtDuration } from '../lib/timer';
import { go, useLive } from '../ui/hooks';
import { H1 } from '../ui/Shell';
import { questionStats } from '../lib/stats';

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card mb-5 p-6">
      <h2 className="mb-4 flex items-baseline gap-3 text-[18px] font-bold"><span className="mono text-[13px]" style={{ color: 'var(--brand)' }}>{n}.</span>{title}</h2>
      {children}
    </section>
  );
}

type Sel = 'all' | 'range' | 'random' | 'missed' | 'marked' | 'unused' | 'used' | 'correct' | 'incorrect' | 'custom';

/** "1-5, 9, 12" → question numbers */
export function parseNumbers(t: string): Set<number> {
  const out = new Set<number>();
  for (const part of t.split(/[,\s]+/)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) continue;
    const a = +m[1];
    const b = m[2] ? +m[2] : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b) && n - Math.min(a, b) < 5000; n++) out.add(n);
  }
  return out;
}
type Preset = 'standard' | 'shelf' | 'custom';
export const BANK_KEY = STORAGE_PREFIX + 'bank-qids';

export function BlockSetup({ examId, preset: pick, bank }: { examId: string | null; preset: string | null; bank: boolean }) {
  const exams = useLive(() => db.exams.toArray(), []);
  const attempts = useLive(() => db.attempts.toArray(), []);
  const reviews = useLive(() => db.reviews.toArray(), []);
  const [sel, setSel] = useState<Sel>(pick === 'missed' ? 'missed' : 'all');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(0);
  const [randomN, setRandomN] = useState(40);
  const [order, setOrder] = useState<'sequential' | 'random'>('sequential');
  const [tutor, setTutor] = useState(bank);
  const [timed, setTimed] = useState(!bank);
  const mode: Mode = tutor ? 'tutor' : timed ? 'exam' : 'untimed';
  const [preset, setPreset] = useState<Preset>('custom');
  const [secPerQ, setSecPerQ] = useState(DEFAULT_SEC_PER_Q);
  const [blocks, setBlocks] = useState(1);
  const [breakMin, setBreakMin] = useState('');
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const [name, setName] = useState('');

  const exam: Exam | undefined = exams?.find((e) => e.id === examId);
  const bankIds: string[] = useMemo(() => {
    if (!bank) return [];
    try {
      return JSON.parse(sessionStorage.getItem(BANK_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  }, [bank]);
  useEffect(() => {
    if (exam && to === 0) setTo(exam.questions.length);
  }, [exam?.id]);

  const qs = useMemo(() => questionStats(attempts ?? []), [attempts]);
  const rows = useMemo(() => (attempts && reviews ? buildMissedBank(attempts, reviews) : []), [attempts, reviews]);
  if (!exams || !attempts || !reviews) return <div className="text-sm">Loading…</div>;
  if (!bank && !exam) return <div>This exam was not found. <a className="link" href="#/">Back to the library</a></div>;

  const missedIds = new Set(rows.filter((r) => r.why.includes('wrong') && r.schedule.status !== 'Mastered').map((r) => r.qid));
  const markedIds = new Set(rows.filter((r) => r.why.includes('marked')).map((r) => r.qid));

  // ---- build the pool ----
  let pool: Pick[] = [];
  if (bank) {
    const byId = new Map<string, Pick>();
    for (const e of exams) for (const q of e.questions) byId.set(q.id, { exam: e, q });
    pool = bankIds.map((id) => byId.get(id)).filter((p): p is Pick => !!p);
  } else if (exam) {
    const all = exam.questions.map((q) => ({ exam, q }));
    if (sel === 'all' || sel === 'random') pool = all;
    else if (sel === 'range') pool = all.filter((p) => p.q.number >= from && p.q.number <= to);
    else if (sel === 'missed') pool = all.filter((p) => missedIds.has(p.q.id));
    else if (sel === 'marked') pool = all.filter((p) => markedIds.has(p.q.id));
    else if (sel === 'unused') pool = all.filter((p) => !qs.get(p.q.id)?.used);
    else if (sel === 'used') pool = all.filter((p) => qs.get(p.q.id)?.used);
    else if (sel === 'correct') pool = all.filter((p) => qs.get(p.q.id)?.last === 'correct');
    else if (sel === 'incorrect') pool = all.filter((p) => { const l = qs.get(p.q.id)?.last; return l === 'incorrect' || l === 'omitted'; });
    else if (sel === 'custom') { const ns = parseNumbers(custom); pool = all.filter((p) => ns.has(p.q.number)); }
  }
  const presetCount = preset === 'standard' ? 40 : preset === 'shelf' ? 110 : null;
  const wanted = sel === 'random' && !bank ? randomN : presetCount;
  const count = Math.min(pool.length, wanted ?? pool.length);
  const nBlocks = preset === 'shelf' ? 4 : preset === 'standard' ? 1 : blocks;
  const sec = preset === 'custom' ? secPerQ : 90;
  const plan = planBlocks(count, mode, sec, nBlocks, null, timed);
  const totalMs = plan.reduce((s, b) => s + (b.limitMs ?? 0), 0);
  const unkeyed = pool.filter((p) => !p.q.answer).length;

  const start = async () => {
    if (!count) return;
    setBusy(true);
    // must be requested synchronously inside the click; never awaited (it can hang or be refused on iPad)
    if (timed && !tutor && !document.fullscreenElement) {
      try {
        void document.documentElement.requestFullscreen?.()?.catch?.(() => {});
      } catch {}
    }
    let picks = pool;
    const takeRandom = (sel === 'random' && !bank) || (presetCount != null && pool.length > presetCount);
    if (takeRandom) {
      picks = shuffle(pool).slice(0, count);
      if (order === 'sequential') picks.sort((a, b) => a.q.number - b.q.number);
    }
    if (order === 'random') picks = shuffle(picks);
    picks = picks.slice(0, count);
    const nm = name.trim() || (bank ? `Missed questions quiz (${count})` : exam!.name);
    const a = createAttempt(
      nm,
      picks,
      mode,
      { secPerQ: timed ? sec : null, confidence: false, preset, order, selection: bank ? 'bank' : sel, breakMinutes: breakMin.trim() ? Math.max(0, parseFloat(breakMin)) : null },
      plan,
    );
    await saveAttempt(a);
    go(`/test/${a.id}`);
  };

  const R = (v: Sel, testId: string, children: React.ReactNode) => (
    <label className="choice items-center" key={v}>
      <input type="radio" name="sel" checked={sel === v} onChange={() => setSel(v)} data-testid={testId} /> {children}
    </label>
  );

  return (
    <div data-testid="block-setup">
      <a className="link text-sm" href={bank ? '#/missed' : `#/exam/${examId}`}>← Back</a>
      <div className="mt-3" />
      <H1 sub={bank ? 'Quiz me on missed questions' : 'Choose questions, set the parameters, and begin.'}>Test Composer</H1>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">

      {!bank && (
        <Step n="I" title="Exam">
          <select className="field w-full max-w-lg" value={exam!.id} onChange={(e) => go(`/setup?exam=${e.target.value}`, true)} data-testid="setup-exam">
            {[...exams].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })).map((e) => (
              <option key={e.id} value={e.id}>{e.subject ? `${e.subject} · ` : ''}{e.name}</option>
            ))}
          </select>
        </Step>
      )}
      {!bank && (
        <Step n="II" title="Question filters">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {R('all', 'sel-all', <>All {exam!.questions.length} questions</>)}
            {R('range', 'sel-range', <>
              Range: from
              <input className="field mx-1 w-16" type="number" min={1} max={exam!.questions.length} value={from} onChange={(e) => { setFrom(parseInt(e.target.value, 10) || 1); setSel('range'); }} data-testid="range-from" />
              to
              <input className="field mx-1 w-16" type="number" min={1} max={exam!.questions.length} value={to} onChange={(e) => { setTo(parseInt(e.target.value, 10) || 1); setSel('range'); }} data-testid="range-to" />
            </>)}
            {R('random', 'sel-random', <>
              Random
              <input className="field mx-1 w-16" type="number" min={1} max={exam!.questions.length} value={randomN} onChange={(e) => { setRandomN(Math.max(1, parseInt(e.target.value, 10) || 1)); setSel('random'); }} data-testid="random-n" />
              questions
            </>)}
            {R('missed', 'sel-missed', <>Missed only ({exam!.questions.filter((q) => missedIds.has(q.id)).length})</>)}
            {R('marked', 'sel-marked', <>Marked only ({exam!.questions.filter((q) => markedIds.has(q.id)).length})</>)}
            {R('unused', 'sel-unused', <>Unused ({exam!.questions.filter((q) => !qs.get(q.id)?.used).length})</>)}
            {R('used', 'sel-used', <>Used ({exam!.questions.filter((q) => qs.get(q.id)?.used).length})</>)}
            {R('correct', 'sel-correct', <>Last answered correctly ({exam!.questions.filter((q) => qs.get(q.id)?.last === 'correct').length})</>)}
            {R('incorrect', 'sel-incorrect', <>Last incorrect or omitted ({exam!.questions.filter((q) => { const l = qs.get(q.id)?.last; return l === 'incorrect' || l === 'omitted'; }).length})</>)}
            {R('custom', 'sel-custom', <>
              Question numbers
              <input className="field mx-1 w-40" placeholder="e.g. 1-5, 9, 12" value={custom} onChange={(e) => { setCustom(e.target.value); setSel('custom'); }} data-testid="custom-numbers" />
            </>)}
          </div>
        </Step>
      )}

      <Step n={bank ? 'I' : 'III'} title="Parameters">
      <label className="mb-4 block text-sm">
        <span className="eyebrow mb-1 block">Test name</span>
        <input className="field w-full max-w-lg" placeholder={bank ? 'Missed questions quiz' : exam!.name} value={name} onChange={(e) => setName(e.target.value)} data-testid="test-name" />
      </label>
      <div className="eyebrow mb-2">Order</div>
      <div className="grid grid-cols-2 gap-2 text-sm sm:max-w-md">
        <label className="choice items-center"><input type="radio" name="order" checked={order === 'sequential'} onChange={() => setOrder('sequential')} /> In order</label>
        <label className="choice items-center"><input type="radio" name="order" checked={order === 'random'} onChange={() => setOrder('random')} data-testid="order-random" /> Shuffled</label>
      </div>

      <div className="eyebrow mb-2 mt-5">Mode</div>
      <div className="grid gap-2 text-sm md:grid-cols-2">
        <label className="choice"><input type="radio" name="mode" checked={!tutor} onChange={() => { setTutor(false); setTimed(true); }} data-testid="mode-exam" /> <span><b className="block">Test mode</b><span className="muted">Answers and explanations stay locked until the block ends, like the real exam.</span></span></label>
        <label className="choice"><input type="radio" name="mode" checked={tutor} onChange={() => setTutor(true)} data-testid="mode-tutor" /> <span><b className="block">Tutor mode</b><span className="muted">See the correct answer and explanation after each question.</span></span></label>
      </div>
      <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
        <label className="choice"><input type="radio" name="timed" checked={timed} onChange={() => setTimed(true)} data-testid="timed-on" /> <span><b className="block">Timed</b><span className="muted">A countdown for each block{!tutor ? '; opens full screen' : ''}.</span></span></label>
        <label className="choice"><input type="radio" name="timed" checked={!timed} onChange={() => { setTimed(false); }} data-testid="mode-untimed" /> <span><b className="block">Untimed</b><span className="muted">No countdown; your time is still recorded.</span></span></label>
      </div>
      <p className="muted mt-2 text-xs">You can switch either one in the middle of a block: click the clock at the bottom of the test screen.</p>

      <div className="eyebrow mb-2 mt-5">Length and timing</div>
      <div className="space-y-2 text-sm">
        <label className="choice flex-wrap items-center"><input type="radio" name="preset" checked={preset === 'custom'} onChange={() => setPreset('custom')} data-testid="preset-custom" /> <span><b>Custom</b>:</span>
          <input className="field mx-1 w-16" type="number" min={10} max={3600} value={secPerQ} disabled={!timed} onChange={(e) => { setSecPerQ(Math.max(5, parseInt(e.target.value, 10) || DEFAULT_SEC_PER_Q)); setPreset('custom'); }} data-testid="sec-per-q" aria-label="Seconds per question" />
          seconds per question, in
          <input className="field mx-1 w-14" type="number" min={1} max={20} value={blocks} onChange={(e) => { setBlocks(Math.max(1, parseInt(e.target.value, 10) || 1)); setPreset('custom'); }} data-testid="block-count" aria-label="Number of blocks" />
          block(s)
        </label>
        <label className="choice items-center"><input type="radio" name="preset" checked={preset === 'standard'} onChange={() => setPreset('standard')} data-testid="preset-standard" /> <span><b>40 questions / 60 minutes</b> (one block)</span></label>
        <label className="choice items-center"><input type="radio" name="preset" checked={preset === 'shelf'} onChange={() => setPreset('shelf')} data-testid="preset-shelf" /> <span><b>Shelf-style</b>: 110 questions in 4 blocks, 2 h 45 min total, with a break screen between blocks</span></label>
        {nBlocks > 1 && (
          <label className="block pl-5">
            Break timer (optional):
            <input className="field mx-1 w-16" type="number" min={0} value={breakMin} onChange={(e) => setBreakMin(e.target.value)} placeholder="none" data-testid="break-min" /> minutes per break
          </label>
        )}
      </div>
      </Step>

      </div>
      <aside className="card accent-top sticky top-24 p-6">
      <h2 className="mb-3 flex items-baseline gap-3 text-[18px] font-bold"><span className="mono text-[13px]" style={{ color: 'var(--brand)' }}>{bank ? 'II' : 'IV'}.</span>Examination dossier</h2>
      <dl className="mono mb-4 space-y-1 text-[12px]" style={{ color: 'var(--ink-2)' }}>
        <div className="flex justify-between gap-2"><dt>Exam</dt><dd className="truncate text-right">{bank ? 'Missed questions' : exam!.name}</dd></div>
        <div className="flex justify-between gap-2"><dt>Mode</dt><dd>{tutor ? 'Tutor' : 'Test'} · {timed ? 'Timed' : 'Untimed'}</dd></div>
        <div className="flex justify-between gap-2"><dt>Order</dt><dd>{order === 'random' ? 'Random' : 'Sequential'}</dd></div>
      </dl>
      <div className="text-sm" data-testid="setup-summary">
        <b>{count}</b> question{count === 1 ? '' : 's'}
        {plan.length > 1 && <> in <b>{plan.length}</b> blocks ({plan.map((b) => b.count).join(' + ')})</>}
        {timed && totalMs > 0 && <> · <b>{fmtDuration(totalMs)}</b> total</>}
        {presetCount != null && pool.length < presetCount && <span className="ml-2 text-gray-700">(only {pool.length} available, so the time is scaled to match)</span>}
        {presetCount != null && pool.length > presetCount && <span className="ml-2 text-gray-700">({presetCount} picked at random from {pool.length})</span>}
        {unkeyed > 0 && <div className="mt-1 text-red-700">{unkeyed} of these questions have no answer in the key and cannot be graded.</div>}
      </div>
      <div className="mt-4">
        <button className="btn-primary w-full px-6 py-2.5 text-base" disabled={!count || busy} onClick={start} data-testid="start-block">
          Begin test →
        </button>
        {!count && (
          <span className="mt-2 block text-sm text-red-700">
            {bank ? (
              <>
                No questions chosen. Open <a className="link" href="#/missed">Missed Questions</a>, filter the list, and click “Quiz me on these”.
              </>
            ) : (
              'No questions match this selection.'
            )}
          </span>
        )}
      </div>
      </aside>
      </div>
    </div>
  );
}
