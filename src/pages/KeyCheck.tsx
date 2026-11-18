import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderPicker } from '../ui/FolderPicker';
import { db } from '../db';
import type { Exam, PageText, Question } from '../types';
import { regrade } from '../lib/attempt';
import { applyKey, blankQuestion, formatPageList, keyWarnings, parsePageList, readKeyFromPdf, readKeyFromText } from '../lib/importer';
import { highlightReader, wordsProvider } from '../lib/analyze';
import { examPdf, openPdf, type PdfDoc } from '../lib/pdf';
import { saveAttempt, saveExam } from '../lib/store';
import { go, useLive, useRoute } from '../ui/hooks';
import { H1 } from '../ui/Shell';
import { QuestionView } from '../ui/QuestionView';
import { Modal } from '../ui/panels';

export function KeyCheck({ examId }: { examId: string }) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [missing, setMissing] = useState(false);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [focus, setFocus] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [reread, setReread] = useState(false);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const route = useRoute();
  const rows = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const texts = useLive<PageText[]>(() => db.pages.where('examId').equals(examId).toArray(), [examId]);
  const textMap = useMemo(() => new Map((texts ?? []).map((t) => [t.page, t])), [texts]);
  const stored = useLive(() => db.exams.get(examId), [examId]);

  useEffect(() => {
    db.exams.get(examId).then((e) => (e ? setExam(e) : setMissing(true)));
    examPdf(examId).then(setDoc, () => {});
  }, [examId]);

  // pick up clickable choices / text added by background processing without losing edits
  useEffect(() => {
    if (!stored || !exam || dirty) return;
    if (stored.updatedAt !== exam.updatedAt) setExam(stored);
  }, [stored?.updatedAt]);

  const warnings = useMemo(() => (exam ? keyWarnings(exam.questions) : []), [exam]);
  const warnByN = useMemo(() => new Map(warnings.map((w) => [w.n, w])), [warnings]);
  if (missing) return <div>This exam was not found. <a className="link" href="#/">Back to the library</a></div>;
  if (!exam) return <div className="text-sm">Loading…</div>;

  const patchQ = (i: number, p: Partial<Question>) => {
    setDirty(true);
    setExam({ ...exam, questions: exam.questions.map((q, k) => (k === i ? { ...q, ...p } : q)) });
  };
  const renumber = (qs: Question[]) => qs.map((q, i) => ({ ...q, number: i + 1 }));
  const jump = () => {
    if (!warnings.length) return;
    const after = warnings.find((w) => w.n > focus + 1) ?? warnings[0];
    const i = exam.questions.findIndex((q) => q.number === after.n);
    setFocus(i);
    const row = rows.current.get(i);
    row?.scrollIntoView({ block: 'center' });
    row?.querySelector<HTMLInputElement>('input')?.focus();
  };
  const save = async (confirm: boolean) => {
    // keep choice regions that background text recognition added while this screen was open
    const latest = await db.exams.get(exam.id);
    const byId = new Map((latest?.questions ?? []).map((q) => [q.id, q]));
    const sameSegs = (a: Question, b: Question) => JSON.stringify(a.segments) === JSON.stringify(b.segments);
    const questions = exam.questions.map((q) => {
      const l = byId.get(q.id);
      if (!l || q.choiceSource === 'manual' || !sameSegs(q, l)) return q;
      return { ...q, choices: l.choices, choiceSource: l.choiceSource, choiceTexts: l.choiceTexts, choiceCount: Math.max(q.choiceCount, l.choices?.length ?? 0) };
    });
    const e2: Exam = { ...exam, questions, textStatus: latest?.textStatus ?? exam.textStatus, keyChecked: confirm ? true : exam.keyChecked };
    await saveExam(e2);
    // history is re-graded with the corrected key
    const attempts = await db.attempts.filter((a) => a.items.some((it) => it.examId === e2.id)).toArray();
    for (const a of attempts) if (regrade(a, e2)) await saveAttempt(a);
    setExam(e2);
    setDirty(false);
    if (confirm) go(`/exam/${e2.id}`);
  };
  const applyParsed = (key: ReturnType<typeof readKeyFromText>) => {
    setExam({ ...exam, questions: applyKey(exam.questions, key, !overwrite) });
    setDirty(true);
    setReread(false);
    setBusy(`${key.entries.filter((e) => e.answer).length} answers read.`);
  };
  const q = exam.questions[focus];
  const keyed = exam.questions.filter((x) => x.answer).length;
  const note = route.query.get('note');
  const found = route.query.get('found');

  return (
    <div data-testid="key-check">
      <H1>Check the answer key</H1>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <label>
          Exam name <input className="field ml-1 w-72" value={exam.name} onChange={(e) => { setExam({ ...exam, name: e.target.value }); setDirty(true); }} data-testid="key-exam-name" />
        </label>
        <label>
          Folder <FolderPicker value={exam.subject ?? ''} onChange={(v) => { setExam({ ...exam, subject: v }); setDirty(true); }} testId="key-folder" />
        </label>
      </div>
      <div className="mb-2 border border-gray-400 bg-gray-50 p-2 text-sm" data-testid="key-summary">
        <b>{exam.questions.length}</b> questions · <b data-testid="keyed-count">{keyed}</b> have an answer
        {found != null && <> · {found} answers were read from your key</>}
        {warnings.length > 0 ? (
          <span className="ml-2 font-bold text-red-700" data-testid="warning-count">
            {warnings.length} warning{warnings.length === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="ml-2 font-bold text-green-800">No warnings</span>
        )}
        {found != null && Number(found) !== exam.questions.length && (
          <div className="mt-1 text-red-700" data-testid="count-mismatch">
            Count mismatch: the key has {found} answers but there are {exam.questions.length} questions. Check the page layout (the “Pages” column) or the key.
          </div>
        )}
        {note && <div className="mt-1 text-red-700">{note} Paste the key as text, or type the answers below.</div>}
        <div className="mt-1 text-gray-700">Look over the answers before your first attempt. Click a row to see its question on the right. Everything here can be changed later.</div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button className="btn" onClick={jump} disabled={!warnings.length} data-testid="next-warning">Jump to next warning</button>
        <button className="btn" onClick={() => setReread(true)} data-testid="reread-key">Read key from text or PDF…</button>
        <a className="btn" href={`#/exam/${exam.id}/layout`} onClick={(e) => { if (dirty && !window.confirm('Leave without saving your changes to the key?')) e.preventDefault(); }}>Questions, pictures and choices…</a>
        <span className="flex-1" />
        {busy && <span className="text-sm">{busy}</span>}
        <button className="btn" onClick={() => void save(false)} disabled={!dirty} data-testid="key-save">Save</button>
        <button className="btn-primary" onClick={() => void save(true)} data-testid="key-confirm">
          {exam.keyChecked ? 'Save and close' : 'Key looks right: save'}
        </button>
      </div>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <table className="w-full border-collapse border border-gray-400" data-testid="key-table">
            <thead>
              <tr>
                <th className="th w-10">#</th>
                <th className="th w-16">Answer</th>
                <th className="th w-16">Choices</th>
                <th className="th w-20">Pages</th>
                <th className="th">Explanation</th>
              </tr>
            </thead>
            <tbody>
              {exam.questions.map((x, i) => {
                const w = warnByN.get(x.number);
                return (
                  <tr key={x.id} ref={(el) => void (el ? rows.current.set(i, el) : rows.current.delete(i))} onFocus={() => setFocus(i)} onClick={() => setFocus(i)} style={{ background: i === focus ? 'var(--brand-soft, #e6edf5)' : w ? 'rgb(239 68 68 / 0.08)' : undefined }} data-testid={`key-row-${x.number}`} data-warning={w?.kind ?? ''}>
                    <td className="td font-bold">
                      {x.number}
                      {w && <div className="text-[10px] font-normal leading-tight text-red-700" title={w.text}>⚠ {w.kind === 'missing' ? 'missing' : w.kind === 'beyond' ? 'beyond choices' : 'check'}</div>}
                    </td>
                    <td className="td">
                      <input className="field w-12 text-center font-bold uppercase" maxLength={1} value={x.answer} aria-label={`Answer for question ${x.number}`} data-testid={`key-answer-${x.number}`} onChange={(e) => patchQ(i, { answer: e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase(), keyConfidence: 1 })} />
                    </td>
                    <td className="td">
                      <input className="field w-12" type="number" min={2} max={26} value={x.choiceCount} aria-label={`Number of choices for question ${x.number}`} onChange={(e) => patchQ(i, { choiceCount: Math.max(2, Math.min(26, parseInt(e.target.value, 10) || 5)) })} />
                    </td>
                    <td className="td">
                      {x.segments.some((s) => s.rect) ? (
                        <span className="text-xs text-gray-600" title="This question is a cropped part of a page. Use “Fix page layout” to change it.">p{formatPageList(x.segments.map((s) => s.page))} (part)</span>
                      ) : (
                        <input
                          className="field w-16"
                          defaultValue={formatPageList(x.segments.map((s) => s.page))}
                          key={formatPageList(x.segments.map((s) => s.page))}
                          aria-label={`Pages for question ${x.number}`}
                          data-testid={`key-pages-${x.number}`}
                          onBlur={(e) => {
                            const pages = parsePageList(e.target.value, exam.pageCount);
                            if (pages.length && formatPageList(pages) !== formatPageList(x.segments.map((s) => s.page))) patchQ(i, { segments: pages.map((page) => ({ page })), choices: undefined });
                          }}
                        />
                      )}
                    </td>
                    <td className="td">
                      <textarea className="field h-[30px] w-full min-w-[180px] text-xs focus:h-40" value={x.explanation} aria-label={`Explanation for question ${x.number}`} data-testid={`key-expl-${x.number}`} onChange={(e) => patchQ(i, { explanation: e.target.value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <button className="btn" data-testid="add-question" onClick={() => { const last = exam.questions[exam.questions.length - 1]; const lastPage = last ? Math.max(...last.segments.map((s) => s.page)) : 0; setExam({ ...exam, questions: [...exam.questions, blankQuestion(exam.id, exam.questions.length + 1, [Math.min(exam.pageCount, lastPage + 1)])] }); setDirty(true); }}>
              + Add a question
            </button>
            <button className="btn" disabled={exam.questions.length < 2} onClick={() => { if (window.confirm(`Remove question ${q.number} from this exam? Later questions are renumbered.`)) { setExam({ ...exam, questions: renumber(exam.questions.filter((_, k) => k !== focus)) }); setFocus(Math.max(0, focus - 1)); setDirty(true); } }}>
              Remove question {q?.number}
            </button>
          </div>
        </div>
        <div className="sticky top-2 hidden w-[440px] shrink-0 border border-gray-400 p-1 lg:block" data-testid="key-preview">
          <div className="px-1 pb-1 text-xs font-bold">Question {q?.number}</div>
          <div className="max-h-[70vh] overflow-auto">{doc && q && <QuestionView exam={exam} question={q} doc={doc} texts={textMap} width={428} readOnly revealKey={q.answer || null} item={{ answer: null, highlights: [], strikes: [] }} />}</div>
        </div>
      </div>

      {reread && (
        <Modal title="Read the answer key again" onClose={() => setReread(false)} wide>
          <p className="mb-2">Paste the key as text, or choose a key PDF. Formats like “1 C, 2 A”, “1. C. explanation”, “Answer: C”, or one letter per line all work.</p>
          <textarea className="field mb-2 h-40 w-full font-mono" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="1 C, 2 A, 3 B …" data-testid="reread-text" aria-label="Answer key text" />
          <label className="mb-3 block">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Replace answers and explanations that are already filled in
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm">
              or a key PDF:{' '}
              <input
                type="file"
                accept="application/pdf,.pdf"
                data-testid="reread-file"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setBusy('Reading the key PDF…');
                  try {
                    const kd = await openPdf(await f.arrayBuffer());
                    const r = await readKeyFromPdf(kd, 1, kd.numPages, wordsProvider(null), (d, t) => setBusy(`Reading the key: page ${d} of ${t}…`), highlightReader, wordsProvider(null, true));
                    applyParsed(r.key);
                  } catch (er) {
                    setBusy('Could not read that PDF: ' + String(er));
                  }
                }}
              />
            </label>
            <button className="btn-primary" disabled={!paste.trim()} onClick={() => applyParsed(readKeyFromText(paste))} data-testid="reread-apply">
              Read pasted text
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
