import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../db';
import type { ChoiceRegion, Exam, PageText, Question, Rect } from '../types';
import { examPdf, type PdfDoc } from '../lib/pdf';
import { FULL, segmentRect } from '../lib/layout';
import { blankQuestion } from '../lib/importer';
import { applyChoices, redetectLayout, resumeBackgroundText } from '../lib/analyze';
import { saveExam } from '../lib/store';
import { go, useLive } from '../ui/hooks';
import { H1, H2 } from '../ui/Shell';
import { PageView, type PageApi } from '../ui/PageView';
import { QuestionView } from '../ui/QuestionView';

type Tool = 'segment' | 'choices' | 'crop';

/** Draw a rectangle on a full page. Calls onRect with page fractions. */
function DrawPage({ examId, doc, page, width, onRect, children }: { examId: string; doc: PdfDoc; page: number; width: number; onRect: (r: Rect) => void; children?: (api: PageApi) => React.ReactNode }) {
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const api = useRef<PageApi | null>(null);
  return (
    <PageView
      examId={examId}
      doc={doc}
      page={page}
      crop={FULL}
      width={width}
      className="border border-gray-500"
      style={{ cursor: 'crosshair', touchAction: 'none' }}
      handlers={{
        onPointerDown: (e) => {
          if (!api.current) return;
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

export function LayoutEditor({ examId }: { examId: string }) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [sel, setSel] = useState(0);
  const [seg, setSeg] = useState(0);
  const [tool, setTool] = useState<Tool>('segment');
  const [cropPage, setCropPage] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const texts = useLive<PageText[]>(() => db.pages.where('examId').equals(examId).toArray(), [examId]);
  const textMap = useMemo(() => new Map((texts ?? []).map((t) => [t.page, t])), [texts]);
  const hasAttempts = useLive(() => db.attempts.where('examId').equals(examId).count(), [examId]);

  useEffect(() => {
    db.exams.get(examId).then((e) => e && setExam(e));
    examPdf(examId).then(setDoc, () => {});
  }, [examId]);

  if (!exam || !doc) return <div className="text-sm">Loading…</div>;
  const q = exam.questions[Math.min(sel, exam.questions.length - 1)];
  const s = q?.segments[Math.min(seg, q.segments.length - 1)];
  const update = (e: Exam) => {
    setExam(e);
    setDirty(true);
  };
  const patchQ = (p: Partial<Question>) => update({ ...exam, questions: exam.questions.map((x) => (x.id === q.id ? { ...x, ...p } : x)) });
  const save = async () => {
    await saveExam(exam);
    setDirty(false);
    setMsg('Saved.');
  };
  const nextLetter = String.fromCharCode(65 + (q.choices?.length ?? 0));

  return (
    <div data-testid="layout-editor">
      <a className="link text-sm" href={`#/exam/${exam.id}/key`} onClick={(e) => { if (dirty && !window.confirm('Leave without saving?')) e.preventDefault(); }}>← Answer key</a>
      <H1>Layout, crop and choices: {exam.name}</H1>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button className={tool === 'segment' ? 'btn-primary' : 'btn'} onClick={() => setTool('segment')}>Question areas</button>
        <button className={tool === 'choices' ? 'btn-primary' : 'btn'} onClick={() => setTool('choices')} data-testid="tool-choices">Fix choices</button>
        <button className={tool === 'crop' ? 'btn-primary' : 'btn'} onClick={() => setTool('crop')} data-testid="tool-crop">Crop for all pages</button>
        <span className="flex-1" />
        {msg && <span className="text-sm">{msg}</span>}
        <button className="btn-primary" disabled={!dirty} onClick={save} data-testid="layout-save">Save</button>
        <button className="btn" onClick={async () => { if (dirty) await save(); go(`/exam/${exam.id}/key`); }}>Done</button>
      </div>
      {exam.textStatus !== 'done' && (
        <div className="mb-2 border border-yellow-600 bg-yellow-50 p-2 text-sm">
          Some pages are still being read in the background ({texts?.length ?? 0} of {exam.pageCount} pages so far). Choice detection improves as they finish.
          <button className="btn ml-2 py-0" onClick={() => resumeBackgroundText(exam.id)}>Continue reading</button>
        </div>
      )}

      {tool === 'crop' ? (
        <div>
          <p className="mb-2 text-sm">Each page is trimmed to the question automatically (toolbars, headers and docks in screenshots are removed). If that looks wrong, drag a box around the question area on any page below and it is used for every page.</p>
          <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
            <label><input type="radio" checked={!exam.crop && exam.autoCrop} onChange={() => update({ ...exam, crop: null, autoCrop: true })} /> Automatic crop per page</label>
            <label><input type="radio" checked={!!exam.crop} readOnly /> My crop for every page {exam.crop ? '' : '(drag a box below)'}</label>
            <label><input type="radio" checked={!exam.crop && !exam.autoCrop} onChange={() => update({ ...exam, crop: null, autoCrop: false })} /> No crop (whole page)</label>
            <label className="ml-4">
              Page <input className="field w-16" type="number" min={1} max={exam.pageCount} value={cropPage} onChange={(e) => setCropPage(Math.max(1, Math.min(exam.pageCount, parseInt(e.target.value, 10) || 1)))} />
            </label>
          </div>
          <DrawPage examId={exam.id} doc={doc} page={cropPage} width={Math.min(900, window.innerWidth - 80)} onRect={(r) => update({ ...exam, crop: r, autoCrop: false })}>
            {(api) => {
              const r = exam.crop ?? (exam.autoCrop ? textMap.get(cropPage)?.autoCrop : null) ?? FULL;
              return <div style={{ ...api.pos(r), outline: '3px solid #16a34a', pointerEvents: 'none' }} data-testid="crop-box" />;
            }}
          </DrawPage>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          <div className="w-44 shrink-0">
            <div className="mb-1 text-xs font-bold">Questions ({exam.questions.length})</div>
            <div className="max-h-[70vh] overflow-y-auto border border-gray-400">
              {exam.questions.map((x, i) => (
                <button key={x.id} className="flex w-full justify-between px-2 py-0.5 text-left text-sm" style={{ background: i === sel ? '#1c4973' : i % 2 ? '#eee' : '#fff', color: i === sel ? '#fff' : '#000' }} onClick={() => { setSel(i); setSeg(0); }} data-testid={`layout-q-${x.number}`}>
                  <span>Q{x.number}</span>
                  <span className="text-xs">
                    p{x.segments.map((g) => g.page).join(',')}
                    {x.choices?.length && !x.forceBubbles ? ` · ${x.choices.length}ch` : ' · bubbles'}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <H2>
              Question {q.number}: part {Math.min(seg, q.segments.length - 1) + 1} of {q.segments.length} (page {s.page})
            </H2>
            <div className="mb-2 flex flex-wrap gap-1 text-sm">
              {q.segments.map((g, i) => (
                <button key={i} className={i === seg ? 'btn-primary py-0' : 'btn py-0'} onClick={() => setSeg(i)}>Part {i + 1} (p{g.page}{g.rect ? ', area' : ''})</button>
              ))}
              {tool === 'segment' && (
                <>
                  <button className="btn py-0" onClick={() => { const pg = Math.min(exam.pageCount, Math.max(...q.segments.map((g) => g.page)) + 1); patchQ({ segments: [...q.segments, { page: pg }], choices: q.choiceSource === 'manual' ? q.choices : undefined }); setSeg(q.segments.length); }}>+ Add next page</button>
                  {q.segments.length > 1 && <button className="btn py-0" onClick={() => { patchQ({ segments: q.segments.filter((_, i) => i !== seg) }); setSeg(0); }}>Remove this part</button>}
                  <button className="btn py-0" onClick={() => patchQ({ segments: q.segments.map((g, i) => (i === seg ? { page: g.page } : g)) })}>Use whole page</button>
                  <label className="ml-2">
                    page <input className="field w-14 py-0" type="number" min={1} max={exam.pageCount} value={s.page} onChange={(e) => { const pg = Math.max(1, Math.min(exam.pageCount, parseInt(e.target.value, 10) || 1)); patchQ({ segments: q.segments.map((g, i) => (i === seg ? { page: pg } : g)) }); }} />
                  </label>
                </>
              )}
            </div>
            {tool === 'segment' ? (
              <p className="mb-2 text-xs text-gray-700">The green box is what is shown for this part. Drag on the page to draw a new area (for pages with several questions).</p>
            ) : (
              <p className="mb-2 text-xs text-gray-700">
                Drag a box around each answer choice in order: the next box becomes <b>{nextLetter}</b>. {q.choices?.length ? `${q.choices.length} choice boxes so far.` : 'No choice boxes yet.'}
              </p>
            )}
            <DrawPage
              examId={exam.id}
              doc={doc}
              page={s.page}
              width={Math.min(820, window.innerWidth - 300)}
              onRect={(r) => {
                if (tool === 'segment') patchQ({ segments: q.segments.map((g, i) => (i === seg ? { page: g.page, rect: r } : g)), choices: q.choiceSource === 'manual' ? q.choices : undefined });
                else {
                  const c: ChoiceRegion = { ...r, page: s.page, letter: nextLetter };
                  const list = [...(q.choices ?? []), c];
                  patchQ({ choices: list, choiceSource: 'manual', forceBubbles: false, choiceCount: Math.max(q.choiceCount, list.length) });
                }
              }}
            >
              {(api) => (
                <>
                  <div style={{ ...api.pos(segmentRect(exam, s, textMap.get(s.page))), outline: '3px solid #16a34a', pointerEvents: 'none' }} />
                  {(q.choices ?? [])
                    .filter((c) => c.page === s.page)
                    .map((c) => (
                      <div key={c.letter} style={{ ...api.pos(c), outline: '2px solid #2563eb', pointerEvents: 'none' }}>
                        <span className="absolute -left-5 top-0 bg-blue-600 px-1 text-xs font-bold text-white">{c.letter}</span>
                      </div>
                    ))}
                </>
              )}
            </DrawPage>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {tool === 'choices' ? (
                <>
                  <button className="btn" onClick={() => patchQ({ choices: q.choices?.slice(0, -1), choiceSource: 'manual' })} disabled={!q.choices?.length}>Undo last box</button>
                  <button className="btn" onClick={() => patchQ({ choices: [], choiceSource: 'manual' })} data-testid="clear-choices">Clear boxes</button>
                  <button
                    className="btn"
                    onClick={() => {
                      const out = applyChoices({ ...exam, questions: [{ ...q, choiceSource: undefined }] }, textMap)[0];
                      patchQ({ choices: out.choices, choiceSource: out.choiceSource, choiceTexts: out.choiceTexts });
                      setMsg(out.choices?.length ? `Found ${out.choices.length} choices.` : 'No choices found on this question: bubbles will be used.');
                    }}
                  >
                    Detect again
                  </button>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={!!q.forceBubbles} onChange={(e) => patchQ({ forceBubbles: e.target.checked })} data-testid="force-bubbles" /> Use bubbles for this question
                  </label>
                </>
              ) : (
                <>
                  <button className="btn" onClick={() => { const qs = [...exam.questions]; const nq = blankQuestion(exam.id, 0, [s.page]); qs.splice(sel + 1, 0, nq); update({ ...exam, questions: renumber(qs) }); setSel(sel + 1); setSeg(0); }}>Insert a question after this one</button>
                  {sel < exam.questions.length - 1 && (
                    <button className="btn" onClick={() => { const nx = exam.questions[sel + 1]; const merged = { ...q, segments: [...q.segments, ...nx.segments], choices: undefined, choiceSource: undefined }; update({ ...exam, questions: renumber(exam.questions.filter((_, i) => i !== sel + 1).map((x, i) => (i === sel ? merged : x))) }); }}>
                      Merge with next question
                    </button>
                  )}
                  {exam.questions.length > 1 && (
                    <button className="btn" onClick={() => { if (window.confirm(`Delete question ${q.number}? Later questions are renumbered.`)) { update({ ...exam, questions: renumber(exam.questions.filter((_, i) => i !== sel)) }); setSel(Math.max(0, sel - 1)); setSeg(0); } }}>
                      Delete question
                    </button>
                  )}
                  <button
                    className="btn"
                    onClick={async () => {
                      if (hasAttempts && !window.confirm('Re-detect all question areas from the page text? Answers stay attached to question numbers.')) return;
                      const qs = await redetectLayout(exam);
                      if (!qs) return setMsg('Could not find question numbers on the pages; keeping the current layout.');
                      update({ ...exam, questions: qs.map((x, i) => ({ ...x, answer: exam.questions[i]?.answer ?? x.answer, explanation: exam.questions[i]?.explanation ?? x.explanation, tags: exam.questions[i]?.tags ?? x.tags })) });
                      setMsg(`Found ${qs.length} questions.`);
                    }}
                  >
                    Detect all question areas again
                  </button>
                </>
              )}
            </div>
            <H2>How it looks in the test</H2>
            <div className="max-w-[760px] border border-gray-400 p-2">
              <QuestionView exam={exam} question={q} doc={doc} texts={textMap} width={Math.min(740, window.innerWidth - 320)} readOnly item={{ answer: q.answer || null, highlights: [], strikes: [] }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
