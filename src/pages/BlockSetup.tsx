import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SEC_PER_Q } from '../config';
import { db } from '../db';
import type { Exam, Mode } from '../types';
import { createAttempt, planBlocks, shuffle, type Pick } from '../lib/attempt';
import { buildMissedBank } from '../lib/missed';
import { saveAttempt } from '../lib/store';
import { fmtDuration } from '../lib/timer';
import { go, useLive } from '../ui/hooks';
import { H1, H2 } from '../ui/Shell';

type Sel = 'all' | 'range' | 'random' | 'missed' | 'marked' | 'tag';
type Preset = 'standard' | 'shelf' | 'custom';
export const BANK_KEY = 'blocksim-bank-qids';

export function BlockSetup({ examId, preset: pick, bank }: { examId: string | null; preset: string | null; bank: boolean }) {
  const exams = useLive(() => db.exams.toArray(), []);
  const attempts = useLive(() => db.attempts.toArray(), []);
  const reviews = useLive(() => db.reviews.toArray(), []);
  const [sel, setSel] = useState<Sel>(pick === 'missed' ? 'missed' : 'all');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(0);
  const [randomN, setRandomN] = useState(40);
  const [tags, setTags] = useState<string[]>([]);
  const [order, setOrder] = useState<'sequential' | 'random'>('sequential');
  const [mode, setMode] = useState<Mode>(bank ? 'tutor' : 'exam');
  const [preset, setPreset] = useState<Preset>('custom');
  const [secPerQ, setSecPerQ] = useState(DEFAULT_SEC_PER_Q);
  const [blocks, setBlocks] = useState(1);
  const [confidence, setConfidence] = useState(false);
  const [breakMin, setBreakMin] = useState('');
  const [busy, setBusy] = useState(false);

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

  const rows = useMemo(() => (attempts && reviews ? buildMissedBank(attempts, reviews) : []), [attempts, reviews]);
  if (!exams || !attempts || !reviews) return <div className="text-sm">Loading…</div>;
  if (!bank && !exam) return <div>This exam was not found. <a className="link" href="#/">Back to the library</a></div>;

  const allTags = exam ? [...new Set(exam.questions.flatMap((q) => q.tags))].sort() : [];
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
    else if (sel === 'tag') pool = all.filter((p) => p.q.tags.some((t) => tags.includes(t)));
  }
  const presetCount = preset === 'standard' ? 40 : preset === 'shelf' ? 110 : null;
  const wanted = sel === 'random' && !bank ? randomN : presetCount;
  const count = Math.min(pool.length, wanted ?? pool.length);
  const nBlocks = preset === 'shelf' ? 4 : preset === 'standard' ? 1 : blocks;
  const sec = preset === 'custom' ? secPerQ : 90;
  const plan = planBlocks(count, mode, sec, nBlocks);
  const totalMs = plan.reduce((s, b) => s + (b.limitMs ?? 0), 0);
  const unkeyed = pool.filter((p) => !p.q.answer).length;

  const start = async () => {
    if (!count) return;
    setBusy(true);
    // must be requested synchronously inside the click; never awaited (it can hang or be refused on iPad)
    if (mode === 'exam' && !document.fullscreenElement) {
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
    const name = bank ? `Missed questions quiz (${count})` : exam!.name;
    const a = createAttempt(
      name,
      picks,
      mode,
      { secPerQ: mode === 'exam' ? sec : null, confidence, preset, order, selection: bank ? 'bank' : sel, breakMinutes: breakMin.trim() ? Math.max(0, parseFloat(breakMin)) : null },
      plan,
    );
    await saveAttempt(a);
    go(`/test/${a.id}`);
  };

  const R = ({ v, children, testId }: { v: Sel; children: React.ReactNode; testId?: string }) => (
    <label className="block">
      <input type="radio" name="sel" checked={sel === v} onChange={() => setSel(v)} data-testid={testId} /> {children}
    </label>
  );

  return (
    <div data-testid="block-setup">
      <a className="link text-sm" href={bank ? '#/missed' : `#/exam/${examId}`}>← Back</a>
      <H1>New block: {bank ? 'Quiz me on missed questions' : exam!.name}</H1>

      {!bank && (
        <>
          <H2>Questions</H2>
          <div className="space-y-1 text-sm">
            <R v="all" testId="sel-all">All {exam!.questions.length} questions</R>
            <R v="range" testId="sel-range">
              Range: from
              <input className="field mx-1 w-16" type="number" min={1} max={exam!.questions.length} value={from} onChange={(e) => { setFrom(parseInt(e.target.value, 10) || 1); setSel('range'); }} data-testid="range-from" />
              to
              <input className="field mx-1 w-16" type="number" min={1} max={exam!.questions.length} value={to} onChange={(e) => { setTo(parseInt(e.target.value, 10) || 1); setSel('range'); }} data-testid="range-to" />
            </R>
            <R v="random" testId="sel-random">
              Random
              <input className="field mx-1 w-16" type="number" min={1} max={exam!.questions.length} value={randomN} onChange={(e) => { setRandomN(Math.max(1, parseInt(e.target.value, 10) || 1)); setSel('random'); }} data-testid="random-n" />
              questions
            </R>
            <R v="missed" testId="sel-missed">Missed only ({exam!.questions.filter((q) => missedIds.has(q.id)).length})</R>
            <R v="marked" testId="sel-marked">Marked only ({exam!.questions.filter((q) => markedIds.has(q.id)).length})</R>
            {allTags.length > 0 && (
              <R v="tag" testId="sel-tag">
                By tag:
                <span className="ml-1 inline-flex flex-wrap gap-1">
                  {allTags.map((t) => (
                    <button key={t} type="button" className="border border-gray-500 px-1.5 text-xs" style={{ background: tags.includes(t) ? '#1c4973' : '#f3f3f3', color: tags.includes(t) ? '#fff' : '#000' }} aria-pressed={tags.includes(t)} onClick={() => { setSel('tag'); setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]); }}>
                      {t}
                    </button>
                  ))}
                </span>
              </R>
            )}
          </div>
        </>
      )}

      <H2>Order</H2>
      <div className="flex gap-5 text-sm">
        <label><input type="radio" name="order" checked={order === 'sequential'} onChange={() => setOrder('sequential')} /> In order</label>
        <label><input type="radio" name="order" checked={order === 'random'} onChange={() => setOrder('random')} data-testid="order-random" /> Shuffled</label>
      </div>

      <H2>Mode</H2>
      <div className="space-y-1 text-sm">
        <label className="block"><input type="radio" name="mode" checked={mode === 'exam'} onChange={() => setMode('exam')} data-testid="mode-exam" /> <b>Exam</b>: timed. Answers and explanations stay locked until the block ends. Opens full screen.</label>
        <label className="block"><input type="radio" name="mode" checked={mode === 'tutor'} onChange={() => setMode('tutor')} data-testid="mode-tutor" /> <b>Tutor</b>: submit each answer to see the correct answer and explanation right away. Not timed.</label>
        <label className="block"><input type="radio" name="mode" checked={mode === 'untimed'} onChange={() => setMode('untimed')} data-testid="mode-untimed" /> <b>Untimed</b>: like Exam, with no clock.</label>
      </div>

      <H2>Length and timing</H2>
      <div className="space-y-1 text-sm">
        <label className="block"><input type="radio" name="preset" checked={preset === 'custom'} onChange={() => setPreset('custom')} data-testid="preset-custom" /> <b>Custom</b>:
          <input className="field mx-1 w-16" type="number" min={10} max={3600} value={secPerQ} disabled={mode !== 'exam'} onChange={(e) => { setSecPerQ(Math.max(5, parseInt(e.target.value, 10) || DEFAULT_SEC_PER_Q)); setPreset('custom'); }} data-testid="sec-per-q" aria-label="Seconds per question" />
          seconds per question, in
          <input className="field mx-1 w-14" type="number" min={1} max={20} value={blocks} onChange={(e) => { setBlocks(Math.max(1, parseInt(e.target.value, 10) || 1)); setPreset('custom'); }} data-testid="block-count" aria-label="Number of blocks" />
          block(s)
        </label>
        <label className="block"><input type="radio" name="preset" checked={preset === 'standard'} onChange={() => setPreset('standard')} data-testid="preset-standard" /> <b>40 questions / 60 minutes</b> (one block)</label>
        <label className="block"><input type="radio" name="preset" checked={preset === 'shelf'} onChange={() => setPreset('shelf')} data-testid="preset-shelf" /> <b>Shelf-style</b>: 110 questions in 4 blocks, 2 h 45 min total, with a break screen between blocks</label>
        {nBlocks > 1 && (
          <label className="block pl-5">
            Break timer (optional):
            <input className="field mx-1 w-16" type="number" min={0} value={breakMin} onChange={(e) => setBreakMin(e.target.value)} placeholder="none" data-testid="break-min" /> minutes per break
          </label>
        )}
        <label className="block pt-1"><input type="checkbox" checked={confidence} onChange={(e) => setConfidence(e.target.checked)} data-testid="opt-confidence" /> Ask how confident I am on each answer (sure / unsure / guess)</label>
      </div>

      <div className="mt-5 border border-gray-400 bg-gray-50 p-3 text-sm" data-testid="setup-summary">
        <b>{count}</b> question{count === 1 ? '' : 's'}
        {plan.length > 1 && <> in <b>{plan.length}</b> blocks ({plan.map((b) => b.count).join(' + ')})</>}
        {mode === 'exam' && totalMs > 0 && <> · <b>{fmtDuration(totalMs)}</b> total</>}
        {presetCount != null && pool.length < presetCount && <span className="ml-2 text-gray-700">(only {pool.length} available, so the time is scaled to match)</span>}
        {presetCount != null && pool.length > presetCount && <span className="ml-2 text-gray-700">({presetCount} picked at random from {pool.length})</span>}
        {unkeyed > 0 && <div className="mt-1 text-red-700">{unkeyed} of these questions have no answer in the key and cannot be graded.</div>}
      </div>
      <div className="mt-3">
        <button className="btn-primary px-6 py-2 text-base" disabled={!count || busy} onClick={start} data-testid="start-block">
          Start block
        </button>
        {!count && <span className="ml-3 text-sm text-red-700">No questions match this selection.</span>}
      </div>
    </div>
  );
}
