import { useMemo, useState } from 'react';
import { DEFAULT_SEC_PER_Q, STORAGE_PREFIX } from '../config';
import { db } from '../db';
import type { Exam, Mode } from '../types';
import { createAttempt, planBlocks, shuffle, type Pick } from '../lib/attempt';
import { buildMissedBank } from '../lib/missed';
import { saveAttempt } from '../lib/store';
import { fmtDuration } from '../lib/timer';
import { go, useLive } from '../ui/hooks';
import { questionStats } from '../lib/stats';
import { useActiveExamId } from '../lib/activeExam';
import { PaperModal } from '../ui/PaperModal';

type Sel = 'all' | 'marked' | 'used' | 'unused' | 'correct' | 'incorrect' | 'missed' | 'custom';
type Preset = 'standard' | 'shelf' | 'custom';
export const BANK_KEY = STORAGE_PREFIX + 'bank-qids';
const folderOf = (e: Exam) => e.subject?.trim() || 'No folder';

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

function Section({ n, title, action, children }: { n: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-5 flex items-baseline justify-between gap-3 border-b-2 pb-3" style={{ borderColor: 'var(--line)' }}>
        <h2 className="text-[24px] font-bold">
          <span style={{ color: 'var(--brand)' }}>{n}.</span> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A checkbox list in a dialog, with search; "systems" can be expanded under each group. */
function PickDialog({ title, groups, chosen, onDone, onClose }: { title: string; groups: { id: string; label: string; items?: { id: string; label: string }[] }[]; chosen: Set<string>; onDone: (s: Set<string>) => void; onClose: () => void }) {
  const [sel, setSel] = useState(new Set(chosen));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const t = q.trim().toLowerCase();
  const shown = groups.filter((g) => !t || g.label.toLowerCase().includes(t) || g.items?.some((i) => i.label.toLowerCase().includes(t)));
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <PaperModal
      title={title}
      onClose={onClose}
      width={600}
      testId="pick-dialog"
      footer={
        <>
          <button className="btn" onClick={() => setSel(new Set(groups.map((g) => g.id)))}>Select all</button>
          <button className="btn-primary btn-caps" onClick={() => onDone(sel)} data-testid="pick-done" disabled={!sel.size}>✓ Done</button>
        </>
      }
    >
      <input className="field mb-3 w-full" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="space-y-1.5">
        {shown.map((g) => (
          <div key={g.id} style={{ background: 'var(--surface-2)' }}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[14px] font-semibold">
              <input type="checkbox" className="h-4 w-4" checked={sel.has(g.id)} onChange={() => toggle(g.id)} />
              {g.items?.length ? (
                <button type="button" className="w-3 text-[11px]" onClick={(e) => { e.preventDefault(); setOpen((o) => { const n = new Set(o); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; }); }} aria-label="Show exams">
                  {open.has(g.id) ? '⌄' : '›'}
                </button>
              ) : null}
              <span className="flex-1">{g.label}</span>
              {g.items && <span className="mono text-[11px] font-normal" style={{ color: 'var(--ink-2)' }}>{g.items.length} exam{g.items.length === 1 ? '' : 's'}</span>}
            </label>
            {open.has(g.id) && g.items && (
              <div className="border-t px-10 py-1.5 text-[13px]" style={{ borderColor: 'var(--line)' }}>
                {g.items.map((i) => (
                  <div key={i.id} className="py-0.5" style={{ color: 'var(--ink-2)' }}>{i.label}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </PaperModal>
  );
}

export function BlockSetup({ examId: rawId, preset: pick, bank }: { examId: string | null; preset: string | null; bank: boolean }) {
  const activeId = useActiveExamId();
  const exams = useLive(() => db.exams.toArray(), []);
  const attempts = useLive(() => db.attempts.toArray(), []);
  const reviews = useLive(() => db.reviews.toArray(), []);
  const [sel, setSel] = useState<Sel>(pick === 'missed' ? 'missed' : 'all');
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
  const [showCustom, setShowCustom] = useState(false);
  const [name, setName] = useState('');
  const [n, setN] = useState<number | null>(null);
  const [extraExams, setExtraExams] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<'folders' | 'exams' | null>(null);

  const examId = rawId === 'active' ? (exams?.find((e) => e.id === activeId)?.id ?? exams?.find((e) => !e.isDemo)?.id ?? exams?.[0]?.id ?? null) : rawId;
  const exam: Exam | undefined = exams?.find((e) => e.id === examId);
  const bankIds: string[] = useMemo(() => {
    if (!bank) return [];
    try {
      return JSON.parse(sessionStorage.getItem(BANK_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  }, [bank]);

  const qs = useMemo(() => questionStats(attempts ?? []), [attempts]);
  const rows = useMemo(() => (attempts && reviews ? buildMissedBank(attempts, reviews) : []), [attempts, reviews]);
  if (!exams || !attempts || !reviews) return <div className="text-sm">Loading…</div>;
  if (!bank && !exam) return <div>This exam was not found. <a className="link" href="#/exams">Back to the library</a></div>;

  const missedIds = new Set(rows.filter((r) => r.why.includes('wrong') && r.schedule.status !== 'Mastered').map((r) => r.qid));
  const markedIds = new Set([...rows.filter((r) => r.why.includes('marked')).map((r) => r.qid), ...[...qs.entries()].filter(([, v]) => v.marked).map(([k]) => k)]);
  const chosenIds = extraExams ?? (exam ? [exam.id] : []);
  const chosen = exams.filter((e) => chosenIds.includes(e.id));
  const folders = [...new Set(chosen.map(folderOf))];
  const allFolders = [...new Set(exams.map(folderOf))].sort();

  // ---- build the pool ----
  let base: Pick[] = [];
  if (bank) {
    const byId = new Map<string, Pick>();
    for (const e of exams) for (const q of e.questions) byId.set(q.id, { exam: e, q });
    base = bankIds.map((id) => byId.get(id)).filter((p): p is Pick => !!p);
  } else base = chosen.flatMap((e) => e.questions.map((q) => ({ exam: e, q })));
  const match: Record<Sel, (p: Pick) => boolean> = {
    all: () => true,
    marked: (p) => markedIds.has(p.q.id),
    used: (p) => !!qs.get(p.q.id)?.used,
    unused: (p) => !qs.get(p.q.id)?.used,
    correct: (p) => qs.get(p.q.id)?.last === 'correct',
    incorrect: (p) => {
      const l = qs.get(p.q.id)?.last;
      return l === 'incorrect' || l === 'omitted';
    },
    missed: (p) => missedIds.has(p.q.id),
    custom: (p) => parseNumbers(custom).has(p.q.number),
  };
  const pool = bank ? base : base.filter(match[sel]);
  const presetCount = preset === 'standard' ? 40 : preset === 'shelf' ? 110 : null;
  const max = pool.length;
  const count = Math.max(0, Math.min(max, presetCount ?? n ?? max));
  const nBlocks = preset === 'shelf' ? 4 : preset === 'standard' ? 1 : blocks;
  const sec = preset === 'custom' ? secPerQ : 90;
  const plan = planBlocks(Math.max(1, count), mode, sec, nBlocks, null, timed);
  const totalMs = plan.reduce((s, b) => s + (b.limitMs ?? 0), 0);
  const unkeyed = pool.filter((p) => !p.q.answer).length;
  const selLabel = { all: 'All', marked: 'Marked', used: 'Used', unused: 'Unused', correct: 'Correct', incorrect: 'Incorrect', missed: 'Missed', custom: 'Custom numbers' }[sel];

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
    if (count < pool.length) {
      picks = order === 'random' ? shuffle(pool).slice(0, count) : pool.slice(0, count);
    }
    if (order === 'random') picks = shuffle(picks);
    const nm = name.trim() || (bank ? `Missed questions quiz (${count})` : chosen.length === 1 ? chosen[0].name : `${chosen.length} exams`);
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

  const SelBtn = ({ v, label }: { v: Sel; label: string }) => (
    <label className="relative flex-1 cursor-pointer py-2 text-center text-[14px] font-semibold" style={sel === v ? { background: 'var(--navy)', color: 'var(--bg)' } : { background: 'var(--surface-2)', color: 'var(--ink-2)', border: '1px solid var(--line)' }}>
      <input type="radio" name="sel" className="absolute inset-0 cursor-pointer opacity-0" checked={sel === v} onChange={() => setSel(v)} data-testid={`sel-${v}`} />
      {label}
      <span className="mono ml-1 text-[11px] opacity-70">{base.filter(match[v]).length}</span>
    </label>
  );

  return (
    <div data-testid="block-setup" className="-mx-4 -mt-8 sm:-mx-8">
      <div className="mb-10 flex flex-wrap items-start justify-between gap-3 border-b-2 p-6" style={{ borderColor: 'var(--line)' }}>
        <div>
          <h1 className="text-[24px] font-bold leading-8">Test Composer</h1>
          <div className="text-[14px]" style={{ color: 'var(--ink-2)' }}>
            {bank ? 'Quiz me on missed questions' : <>From: <b style={{ color: 'var(--ink)' }}>{chosen.length === 1 ? chosen[0].name : `${chosen.length} exams`}</b></>}
          </div>
        </div>
        <a className="link text-[14px]" href={bank ? '#/missed' : '#/'}>← Return to {bank ? 'Missed Questions' : 'Dashboard'}</a>
      </div>

      <div className="mx-auto max-w-[960px] px-4 pb-16">
        {!bank && (
          <>
            <Section n="I" title="Folder Selection" action={<button className="link text-[14px]" onClick={() => setDialog('folders')} data-testid="modify-folders">Modify Selection</button>}>
              <div className="px-4">
                <div className="mb-1 text-[16px] font-bold" style={{ fontFamily: "'Playfair Display', var(--serif)" }}>Selected Folders</div>
                <div className="text-[14px] font-semibold" style={{ color: 'var(--brand)' }}>{folders.length === allFolders.length && allFolders.length > 1 ? 'All Folders' : folders.join(', ')}</div>
              </div>
            </Section>
            <Section n="II" title="Exam Selection" action={<button className="link text-[14px]" onClick={() => setDialog('exams')} data-testid="modify-exams">Modify Selection</button>}>
              <div className="px-4">
                <div className="mb-1 text-[16px] font-bold" style={{ fontFamily: "'Playfair Display', var(--serif)" }}>Selected Exams</div>
                <div className="text-[14px] font-semibold" style={{ color: 'var(--brand)' }} data-testid="selected-exams">{chosen.map((e) => e.name).join(', ')}</div>
              </div>
            </Section>
            <Section n="III" title="Question Filters">
              <div className="mb-3 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Status (Select One)</div>
              <div className="flex flex-wrap gap-2">
                <SelBtn v="all" label="All" />
                <SelBtn v="marked" label="Marked" />
                <SelBtn v="used" label="Used" />
                <SelBtn v="unused" label="Unused" />
                <SelBtn v="correct" label="Correct" />
                <SelBtn v="incorrect" label="Incorrect" />
                {(pick === 'missed' || sel === 'missed') && <SelBtn v="missed" label="Missed" />}
              </div>
              <div className="mt-5">
                {showCustom || sel === 'custom' ? (
                  <label className="flex flex-wrap items-center gap-2 text-[14px]">
                    <input type="radio" name="sel" checked={sel === 'custom'} onChange={() => setSel('custom')} data-testid="sel-custom" />
                    Question numbers
                    <input className="field w-64" placeholder="e.g. 1-5, 9, 12" value={custom} onChange={(e) => { setCustom(e.target.value); setSel('custom'); }} data-testid="custom-numbers" />
                  </label>
                ) : (
                  <button className="link text-[14px]" onClick={() => setShowCustom(true)} data-testid="show-custom">
                    Specify custom question numbers
                  </button>
                )}
              </div>
            </Section>
          </>
        )}

        <Section n={bank ? 'I' : 'IV'} title="Test Parameters">
          <label className="mb-6 block">
            <span className="mb-2 block text-[14px] font-semibold">Test Name (optional)</span>
            <input className="field mono w-full" maxLength={100} placeholder="e.g., Cardiology Review Block 1" value={name} onChange={(e) => setName(e.target.value)} data-testid="test-name" />
            <span className="mt-1 block text-[12px]" style={{ color: 'var(--ink-2)' }}>{name.length}/100 characters</span>
          </label>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border p-6" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
              <div className="text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Number of Questions</div>
              <div className="mb-4 text-[12px]" style={{ color: 'var(--ink-2)' }}>
                Max available based on selection: <b>{max}</b>
              </div>
              <div className="mb-6 flex items-center justify-center gap-4">
                <button className="mono px-2 text-[24px] font-bold" style={{ color: 'var(--ink-2)' }} onClick={() => { setPreset('custom'); setN(Math.max(1, count - 1)); }} aria-label="Fewer questions" data-testid="count-minus">−</button>
                <input className="field mono w-20 text-center text-[24px] font-bold" style={{ background: 'var(--surface)' }} type="number" min={1} max={max} value={count} onChange={(e) => { setPreset('custom'); setN(Math.max(1, parseInt(e.target.value, 10) || 1)); }} data-testid="count" aria-label="Number of questions" />
                <button className="mono px-2 text-[24px] font-bold" style={{ color: 'var(--ink-2)' }} onClick={() => { setPreset('custom'); setN(Math.min(max, count + 1)); }} aria-label="More questions" data-testid="count-plus">+</button>
              </div>
              <div className="mb-2 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Order</div>
              <div className="grid grid-cols-2 p-1" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
                {(['random', 'sequential'] as const).map((o) => (
                  <label key={o} className="relative cursor-pointer py-2 text-center text-[14px] font-semibold" style={order === o ? { background: 'var(--navy)', color: 'var(--bg)' } : { color: 'var(--ink-2)' }}>
                    <input type="radio" name="order" className="absolute inset-0 cursor-pointer opacity-0" checked={order === o} onChange={() => setOrder(o)} data-testid={`order-${o}`} />
                    {o === 'random' ? 'Random' : 'Sequential'}
                  </label>
                ))}
              </div>
            </div>
            <div className="border p-6" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
              <div className="mb-3 text-[18px] font-bold" style={{ fontFamily: 'var(--serif)' }}>Study Mode</div>
              {(
                [
                  [true, 'mode-tutor', 'Tutor Mode', 'Receive immediate feedback after each question.'],
                  [false, 'mode-exam', 'Test Mode', 'Answers and explanations stay hidden until the test ends.'],
                ] as const
              ).map(([t, id, l, d]) => (
                <label key={id} className="mb-3 flex cursor-pointer items-start gap-3 border-2 p-3" style={{ borderColor: tutor === t ? 'var(--ink)' : 'var(--line)', background: 'var(--surface)' }}>
                  <input type="radio" name="mode" className="mt-1" checked={tutor === t} onChange={() => { setTutor(t); if (!t) setTimed(true); }} data-testid={id} />
                  <span>
                    <b className="block text-[16px]">{l}</b>
                    <span className="text-[14px]" style={{ color: 'var(--ink-2)' }}>{d}</span>
                  </span>
                </label>
              ))}
              <div className="mt-1 grid grid-cols-2 gap-2 text-[14px]">
                {(
                  [
                    [true, 'timed-on', 'Timed', 'Countdown per block'],
                    [false, 'mode-untimed', 'Untimed', 'Time is still recorded'],
                  ] as const
                ).map(([v, id, l, d]) => (
                  <label key={id} className="flex cursor-pointer items-start gap-2 border-2 p-2.5" style={{ borderColor: timed === v ? 'var(--ink)' : 'var(--line)', background: 'var(--surface)' }}>
                    <input type="radio" name="timed" className="mt-1" checked={timed === v} onChange={() => setTimed(v)} data-testid={id} />
                    <span>
                      <b className="block">{l}</b>
                      <span className="text-[12px]" style={{ color: 'var(--ink-2)' }}>{d}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <details className="mt-6 rounded-none border p-4 text-[14px]" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
            <summary className="cursor-pointer font-semibold">Timing and blocks</summary>
            <div className="mt-3 space-y-2">
              <label className="flex flex-wrap items-center gap-2">
                <input type="radio" name="preset" checked={preset === 'custom'} onChange={() => setPreset('custom')} data-testid="preset-custom" />
                <b>Custom:</b>
                <input className="field w-20" type="number" min={10} max={3600} value={secPerQ} disabled={!timed} onChange={(e) => { setSecPerQ(Math.max(5, parseInt(e.target.value, 10) || DEFAULT_SEC_PER_Q)); setPreset('custom'); }} data-testid="sec-per-q" aria-label="Seconds per question" />
                seconds per question, in
                <input className="field w-16" type="number" min={1} max={20} value={blocks} onChange={(e) => { setBlocks(Math.max(1, parseInt(e.target.value, 10) || 1)); setPreset('custom'); }} data-testid="block-count" aria-label="Number of blocks" />
                block(s)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="preset" checked={preset === 'standard'} onChange={() => setPreset('standard')} data-testid="preset-standard" /> <b>40 questions / 60 minutes</b> (one block)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="preset" checked={preset === 'shelf'} onChange={() => setPreset('shelf')} data-testid="preset-shelf" /> <b>Shelf-style</b>: 110 questions in 4 blocks, 2 h 45 min, with breaks
              </label>
              {nBlocks > 1 && (
                <label className="flex items-center gap-2 pl-6">
                  Break timer (optional):
                  <input className="field w-20" type="number" min={0} value={breakMin} onChange={(e) => setBreakMin(e.target.value)} placeholder="none" data-testid="break-min" /> minutes per break
                </label>
              )}
              <p className="text-[12px]" style={{ color: 'var(--ink-2)' }}>You can switch tutor/test and timed/untimed in the middle of a test: click the clock on the test screen.</p>
            </div>
          </details>
        </Section>

        <section className="border-2 p-8 text-center" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
          <h2 className="mb-1 text-[24px] font-bold">Examination Dossier</h2>
          <p className="mb-5 text-[16px]" style={{ color: 'var(--ink-2)' }}>Please verify the parameters below before commencing the test.</p>
          <div className="mx-auto mb-6 max-w-[620px] border-y py-4" style={{ borderColor: 'var(--line)' }}>
            <div className="mono mb-2 text-[16px]" data-testid="setup-summary">
              {bank ? 'Missed questions' : chosen.length === 1 ? chosen[0].name : `${chosen.length} exams`} • {folders.length === 1 ? folders[0] : `${folders.length} folders`} • <b>{count}</b> question{count === 1 ? '' : 's'}
              {plan.length > 1 && <> in <b>{plan.length}</b> blocks ({plan.map((b) => b.count).join(' + ')})</>}
            </div>
            <div className="mono text-[12px]" style={{ color: 'var(--ink-2)' }}>
              Mode: <b style={{ color: 'var(--ink)' }}>{tutor ? 'Tutor' : 'Test'}</b> · {timed ? <>Timed{totalMs > 0 && <> (<b style={{ color: 'var(--ink)' }}>{fmtDuration(totalMs)}</b>)</>}</> : 'Untimed'} · Order: <b style={{ color: 'var(--ink)' }}>{order === 'random' ? 'Random' : 'Sequential'}</b>
              {!bank && <> · Filters: <b style={{ color: 'var(--ink)' }}>{selLabel}</b></>}
            </div>
            {presetCount != null && pool.length < presetCount && <div className="mt-1 text-[12px]" style={{ color: 'var(--ink-2)' }}>(only {pool.length} available, so the time is scaled to match)</div>}
            {unkeyed > 0 && <div className="mt-2 text-[13px]" style={{ color: 'var(--bad)' }}>{unkeyed} of these questions have no answer in the key and cannot be graded.</div>}
          </div>
          <button className="btn-primary btn-caps w-full max-w-[448px] py-4 text-[18px]" style={{ fontSize: 18, letterSpacing: '0.9px', padding: '16px 32px' }} disabled={!count || busy} onClick={start} data-testid="start-block">
            Begin Test
          </button>
          {!count && (
            <span className="mt-3 block text-[14px]" style={{ color: 'var(--bad)' }}>
              {bank ? (
                <>
                  No questions chosen. Open <a className="link" href="#/missed">Missed Questions</a>, filter the list, and click “Quiz me on these”.
                </>
              ) : (
                'No questions match this selection.'
              )}
            </span>
          )}
        </section>
      </div>

      {dialog === 'folders' && (
        <PickDialog
          title="Select Folders"
          groups={allFolders.map((f) => ({ id: f, label: f, items: exams.filter((e) => folderOf(e) === f).map((e) => ({ id: e.id, label: e.name })) }))}
          chosen={new Set(folders)}
          onClose={() => setDialog(null)}
          onDone={(s) => {
            const ids = exams.filter((e) => s.has(folderOf(e)) && !e.isDemo).map((e) => e.id);
            const keep = chosenIds.filter((id) => s.has(folderOf(exams.find((e) => e.id === id)!)));
            setExtraExams(keep.length ? [...new Set([...keep, ...ids])] : ids.length ? ids : exams.filter((e) => s.has(folderOf(e))).map((e) => e.id));
            setDialog(null);
          }}
        />
      )}
      {dialog === 'exams' && (
        <PickDialog
          title="Select Exams"
          groups={[...exams].sort((x, y) => folderOf(x).localeCompare(folderOf(y)) || x.name.localeCompare(y.name, undefined, { numeric: true })).map((e) => ({ id: e.id, label: `${folderOf(e)} · ${e.name}` }))}
          chosen={new Set(chosenIds)}
          onClose={() => setDialog(null)}
          onDone={(s) => {
            setExtraExams([...s]);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
