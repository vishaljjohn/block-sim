import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../db';
import type { ChoiceRegion, Exam, PageText, Question, Rect } from '../types';
import { examPdf, type PdfDoc } from '../lib/pdf';
import { FULL, segmentRect } from '../lib/layout';
import { blankQuestion } from '../lib/importer';
import { applyChoices, redetectLayout, resumeBackgroundText } from '../lib/analyze';
import { saveExam } from '../lib/store';
import { go, useElementWidth, useLive } from '../ui/hooks';
import { PageView, type PageApi } from '../ui/PageView';
import { QuestionView } from '../ui/QuestionView';

/** Draw a rectangle on a full page (page fractions). */
function DrawPage({ examId, doc, page, width, enabled, onRect, children }: { examId: string; doc: PdfDoc; page: number; width: number; enabled: boolean; onRect: (r: Rect) => void; children?: (api: PageApi) => React.ReactNode }) {
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const api = useRef<PageApi | null>(null);
  return (
    <PageView
      examId={examId}
      doc={doc}
      page={page}
      crop={FULL}
      width={width}
      className="border border-gray-400"
      style={{ cursor: enabled ? 'crosshair' : 'default', touchAction: enabled ? 'none' : 'auto' }}
      handlers={{
        onPointerDown: (e) => {
          if (!enabled || !api.current) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const p = api.current.toPage(e.clientX, e.clientY);
          setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        },
        onPointerMove: (e) => {
          if (!drag || !api.current) return;
          const p = api.current.toPage(e.clientX, e.clientY);
          setDrag({ ...drag, x1: p.x, y1: p.y });
        },
        onPointerUp: () => {
          if (!drag) return;
          const r = norm(drag);
          setDrag(null);
          if (r.w > 0.01 && r.h > 0.008) onRect(r);
        },
      }}
    >
      {(a) => {
        api.current = a;
        return (
          <>
            {children?.(a)}
            {drag && <div style={{ ...a.pos(norm(drag)), border: '2px dashed #1c4973', background: 'rgba(28,73,115,0.08)', pointerEvents: 'none' }} />}
          </>
        );
      }}
    </PageView>
  );
}

function norm(d: { x0: number; y0: number; x1: number; y1: number }): Rect {
  const c = (v: number) => Math.min(1, Math.max(0, v));
  const x = c(Math.min(d.x0, d.x1));
  const y = c(Math.min(d.y0, d.y1));
  return { x, y, w: c(Math.max(d.x0, d.x1)) - x, h: c(Math.max(d.y0, d.y1)) - y };
}

const renumber = (qs: Question[]) => qs.map((q, i) => ({ ...q, number: i + 1 }));

/** Fix what each question shows and where its answer choices are. Every change saves at once and can be undone. */
export function LayoutEditor({ examId }: { examId: string }) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [sel, setSel] = useState(0);
  const [seg, setSeg] = useState(0);
  const [areaLocked, setAreaLocked] = useState(true);
  const [choicesLocked, setChoicesLocked] = useState(true);
  const [redrawStarted, setRedrawStarted] = useState(false);
  const [msg, setMsg] = useState('');
  const undo = useRef<Exam[]>([]);
  const redo = useRef<Exam[]>([]);
  const [, force] = useState(0);
  const [colRef, colW] = useElementWidth<HTMLDivElement>();
  const texts = useLive<PageText[]>(() => db.pages.where('examId').equals(examId).toArray(), [examId]);
  const textMap = useMemo(() => new Map((texts ?? []).map((t) => [t.page, t])), [texts]);

  useEffect(() => {
    db.exams.get(examId).then((e) => e && setExam(e));
    examPdf(examId).then(setDoc, () => {});
  }, [examId]);

  /** apply + save + remember for undo */
  const update = (e: Exam, note = '') => {
    if (exam) undo.current.push(exam);
    if (undo.current.length > 100) undo.current.shift();
    redo.current = [];
    setExam(e);
    void saveExam(e);
    setMsg(note || 'Saved.');
    force((n) => n + 1);
  };
  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev || !exam) return;
    redo.current.push(exam);
    setExam(prev);
    void saveExam(prev);
    setMsg('Undone.');
    force((n) => n + 1);
  };
  const doRedo = () => {
    const next = redo.current.pop();
    if (!next || !exam) return;
    undo.current.push(exam);
    setExam(next);
    void saveExam(next);
    setMsg('Redone.');
    force((n) => n + 1);
  };
  /** previous / next question (buttons and the ← → keys) */
  const stepQ = (d: number) => {
    const n = exam?.questions.length ?? 1;
    setSel((i) => Math.min(n - 1, Math.max(0, Math.min(i, n - 1) + d)));
    setSeg(0);
    setAreaLocked(true);
    setChoicesLocked(true);
    setRedrawStarted(false);
  };
  // keep the selected question visible in the list
  useEffect(() => {
    document.querySelector(`[data-testid="layout-q-${(exam?.questions[sel]?.number ?? sel + 1)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel, exam?.questions.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        stepQ(e.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  if (!exam || !doc) return <div className="text-sm">Loading…</div>;
  const q = exam.questions[Math.min(sel, exam.questions.length - 1)];
  const s = q.segments[Math.min(seg, q.segments.length - 1)];
  const patchQ = (p: Partial<Question>, note?: string) => update({ ...exam, questions: exam.questions.map((x) => (x.id === q.id ? { ...x, ...p } : x)) }, note);
  const choose = (i: number) => {
    setSel(i);
    setSeg(0);
    setAreaLocked(true);
    setChoicesLocked(true);
    setRedrawStarted(false);
  };
  const pageChoices = (q.choices ?? []).filter((c) => c.page === s.page);
  const nextLetter = String.fromCharCode(65 + (redrawStarted ? (q.choices?.length ?? 0) : 0));
  const status = (x: Question) => (x.forceBubbles || !x.choices?.length ? 'bubbles' : `${x.choices.length} choices`);
  const width = Math.min(900, Math.max(320, colW || 600));

  return (
    <div data-testid="layout-editor">
      <a className="link text-sm" href={`#/exam/${exam.id}/key`}>← Answer key</a>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Questions and choices: {exam.name}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600" data-testid="layout-msg">{msg}</span>
          <button className="btn" onClick={doUndo} disabled={!undo.current.length} data-testid="undo" title="Undo (⌘Z / Ctrl+Z)">↶ Undo</button>
          <button className="btn" onClick={doRedo} disabled={!redo.current.length} data-testid="redo" title="Redo (⇧⌘Z / Ctrl+Shift+Z)">↷ Redo</button>
          <button className="btn-primary" onClick={() => go(`/exam/${exam.id}`)} data-testid="layout-done">Done</button>
        </div>
      </div>
      <div className="mb-3 rounded border border-gray-300 bg-blue-50 p-2 text-sm">
        <b>Green</b> = what the question shows in the test. <b>Blue</b> = the answer choices you can click. To change one, untick its lock and drag on the page. Changes save at once; use Undo if you change your mind.
      </div>
      {exam.textStatus !== 'done' && (
        <div className="mb-2 rounded border border-yellow-600 bg-yellow-50 p-2 text-sm">
          Some pages are still being read ({texts?.length ?? 0} of {exam.pageCount}). Choices appear as they finish.
          <button className="btn ml-2 py-0" onClick={() => resumeBackgroundText(exam.id)}>Continue reading</button>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* question list */}
        <div className="w-44 shrink-0">
          <div className="mb-1 text-xs font-bold">Questions ({exam.questions.length})</div>
          <div className="max-h-[75vh] overflow-y-auto rounded border border-gray-300">
            {exam.questions.map((x, i) => (
              <button key={x.id} className="flex w-full justify-between px-2 py-1 text-left text-sm" style={{ background: i === sel ? 'var(--brand)' : i % 2 ? 'var(--surface-2)' : 'var(--surface)', color: i === sel ? '#fff' : 'var(--ink)' }} onClick={() => choose(i)} data-testid={`layout-q-${x.number}`}>
                <span>Q{x.number}</span>
                <span className="text-[11px] opacity-80">{status(x)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* page with boxes */}
        <div className="min-w-0 flex-1" ref={colRef}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-1">
              <button className="btn py-0" onClick={() => stepQ(-1)} disabled={sel <= 0} title="Previous question (←)" data-testid="layout-prev">
                ‹ Previous
              </button>
              <b className="px-1" data-testid="layout-current">
                Question {q.number} <span className="font-normal text-gray-600">of {exam.questions.length}</span>
              </b>
              <button className="btn py-0" onClick={() => stepQ(1)} disabled={sel >= exam.questions.length - 1} title="Next question (→)" data-testid="layout-next">
                Next ›
              </button>
            </span>
            <span className="mx-1 h-5 w-px bg-gray-300" aria-hidden="true" />
            {q.segments.map((g, i) => (
              <button key={i} className={i === seg ? 'btn-primary py-0' : 'btn py-0'} onClick={() => setSeg(i)}>Page {g.page}</button>
            ))}
            <button className="btn py-0" onClick={() => { const pg = Math.min(exam.pageCount, Math.max(...q.segments.map((g) => g.page)) + 1); patchQ({ segments: [...q.segments, { page: pg }], areaManual: true }, `Page ${pg} added.`); setSeg(q.segments.length); }} data-testid="add-page">+ Add next page</button>
            {q.segments.length > 1 && <button className="btn py-0" onClick={() => { patchQ({ segments: q.segments.filter((_, i) => i !== seg), areaManual: true }, 'Page removed.'); setSeg(0); }}>Remove this page</button>}
          </div>
          <DrawPage
            examId={exam.id}
            doc={doc}
            page={s.page}
            width={width}
            enabled={!areaLocked || !choicesLocked}
            onRect={(r) => {
              if (!areaLocked) {
                patchQ({ segments: q.segments.map((g, i) => (i === seg ? { page: g.page, rect: r } : g)), areaManual: true }, 'Question area changed.');
                return;
              }
              if (!choicesLocked) {
                const first = !redrawStarted;
                const base = first ? [] : (q.choices ?? []);
                const c: ChoiceRegion = { ...r, page: s.page, letter: String.fromCharCode(65 + base.length) };
                const list = [...base, c];
                setRedrawStarted(true);
                patchQ({ choices: list, choiceSource: 'manual', forceBubbles: false, choiceCount: list.length, choiceCountSet: false }, `Choice ${c.letter} drawn.`);
              }
            }}
          >
            {(api) => (
              <>
                <div style={{ ...api.pos(segmentRect(exam, s, textMap.get(s.page))), outline: '3px solid #16a34a', pointerEvents: 'none' }} data-testid="area-box" />
                {pageChoices.map((c) => (
                  <div key={c.letter} style={{ ...api.pos(c), outline: '2px solid #2563eb', background: 'rgba(37,99,235,0.06)', pointerEvents: 'none' }}>
                    <span className="absolute -left-5 top-0 bg-blue-600 px-1 text-xs font-bold text-white">{c.letter}</span>
                  </div>
                ))}
              </>
            )}
          </DrawPage>
        </div>

        {/* controls */}
        <div className="w-72 shrink-0 space-y-3 text-sm">
          <div className="rounded border border-gray-300 bg-white p-3">
            <label className="flex items-center gap-2 font-bold">
              <input type="checkbox" checked={areaLocked} onChange={(e) => { setAreaLocked(e.target.checked); if (!e.target.checked) setChoicesLocked(true); }} data-testid="lock-area" />
              Question area locked
            </label>
            <p className="mt-1 text-xs text-gray-600">{areaLocked ? 'Untick to redraw what this page shows for the question (for example to include its pictures).' : 'Drag a box on the page around everything the question should show.'}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <button className="btn py-0.5 text-xs" onClick={() => patchQ({ segments: q.segments.map((g, i) => (i === seg ? { page: g.page } : g)), areaManual: true }, 'Using the whole page.')}>Use whole page</button>
              {s.rect && (
                <button className="btn py-0.5 text-xs" onClick={() => update({ ...exam, crop: s.rect!, autoCrop: false }, 'This area is now used on every page.')} data-testid="area-all-pages">
                  Use this area on every page
                </button>
              )}
              {(exam.crop || !exam.autoCrop) && (
                <button className="btn py-0.5 text-xs" onClick={() => update({ ...exam, crop: null, autoCrop: true }, 'Automatic trimming is back on.')}>Back to automatic trimming</button>
              )}
            </div>
          </div>

          <div className="rounded border border-gray-300 bg-white p-3">
            <label className="flex items-center gap-2 font-bold">
              <input type="checkbox" checked={choicesLocked} onChange={(e) => { setChoicesLocked(e.target.checked); setRedrawStarted(false); if (!e.target.checked) setAreaLocked(true); }} data-testid="lock-choices" />
              Answer choices locked
            </label>
            <p className="mt-1 text-xs text-gray-600">
              {choicesLocked ? `${q.choices?.length ? `${q.choices.length} choices found.` : 'No choices found: bubbles are used.'} Untick to draw them yourself.` : `Drag a box around each choice in order. The next box is ${nextLetter}.`}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <button
                className="btn py-0.5 text-xs"
                onClick={() => {
                  const out = applyChoices({ ...exam, questions: [{ ...q, choiceSource: undefined }] }, textMap)[0];
                  patchQ({ choices: out.choices, choiceSource: out.choiceSource, choiceTexts: out.choiceTexts, choiceCountSet: false }, out.choices?.length ? `Found ${out.choices.length} choices.` : 'No choices found: bubbles will be used.');
                }}
              >
                Find choices automatically
              </button>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={!!q.forceBubbles} onChange={(e) => patchQ({ forceBubbles: e.target.checked }, e.target.checked ? 'This question uses bubbles.' : 'This question uses clickable choices.')} data-testid="force-bubbles" /> Use bubbles for this question
              </label>
            </div>
          </div>

          <div className="rounded border border-gray-300 bg-white p-3">
            <div className="mb-1 font-bold">Question</div>
            <div className="flex flex-wrap gap-1">
              <button className="btn py-0.5 text-xs" onClick={() => { const qs = [...exam.questions]; qs.splice(sel + 1, 0, { ...blankQuestion(exam.id, 0, [s.page]), areaManual: true }); update({ ...exam, questions: renumber(qs) }, 'Question inserted.'); choose(sel + 1); }}>Insert one after</button>
              {sel < exam.questions.length - 1 && (
                <button className="btn py-0.5 text-xs" onClick={() => { const nx = exam.questions[sel + 1]; const merged = { ...q, segments: [...q.segments, ...nx.segments], choices: undefined, choiceSource: undefined, areaManual: true }; update({ ...exam, questions: renumber(exam.questions.filter((_, i) => i !== sel + 1).map((x, i) => (i === sel ? merged : x))) }, 'Merged with the next question.'); }}>
                  Merge with next
                </button>
              )}
              {exam.questions.length > 1 && <button className="btn py-0.5 text-xs" onClick={() => { update({ ...exam, questions: renumber(exam.questions.filter((_, i) => i !== sel)) }, `Question ${q.number} deleted.`); choose(Math.max(0, sel - 1)); }}>Delete question</button>}
            </div>
            <button
              className="btn mt-2 w-full py-0.5 text-xs"
              onClick={async () => {
                const qs = await redetectLayout(exam);
                if (!qs) return setMsg('Could not find question numbers on the pages; nothing changed.');
                update({ ...exam, questions: qs.map((x, i) => ({ ...x, answer: exam.questions[i]?.answer ?? x.answer, explanation: exam.questions[i]?.explanation ?? x.explanation })) }, `Found ${qs.length} questions.`);
              }}
            >
              Find all questions again (automatic)
            </button>
          </div>

          <div className="rounded border border-gray-300 bg-white p-2">
            <div className="mb-1 text-xs font-bold">How it looks in the test</div>
            <div className="max-h-80 overflow-auto">
              <QuestionView exam={exam} question={q} doc={doc} texts={textMap} width={262} readOnly item={{ answer: null, highlights: [], strikes: [] }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
